import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URLEncoder
import groovy.json.JsonSlurper

import org.apache.commons.lang3.StringUtils

import com.sourcekraft.documentburster.common.security.SecretsCipher

import org.apache.commons.mail.MultiPartEmail
import org.apache.commons.mail.ImageHtmlEmail
import org.apache.commons.mail.EmailAttachment
import org.apache.commons.mail.resolver.DataSourceFileResolver
import org.apache.commons.mail.resolver.DataSourceUrlResolver

import com.sourcekraft.documentburster.mail.SimpleJavaMailDecorator

import com.sourcekraft.documentburster.utils.Utils

// Resolves a fresh access token from the provider's token endpoint using the stored refresh token.
// Called only when message.oauth2provider != "NONE".
def mintAccessToken = { provider, tenantId, clientId, tokenUrl, scope, refreshToken ->
	String resolvedTokenUrl
	String resolvedScope
	switch (provider) {
		case "MICROSOFT":
			String tid = StringUtils.isNotBlank(tenantId) ? tenantId : "common"
			resolvedTokenUrl = "https://login.microsoftonline.com/${tid}/oauth2/v2.0/token"
			resolvedScope    = "https://outlook.office.com/SMTP.Send offline_access"
			break
		case "GOOGLE":
			resolvedTokenUrl = "https://oauth2.googleapis.com/token"
			resolvedScope    = "https://mail.google.com/"
			break
		default: // GENERIC
			resolvedTokenUrl = tokenUrl
			resolvedScope    = scope
	}

	def params = [
		"grant_type=refresh_token",
		"client_id=${URLEncoder.encode(clientId ?: '', 'UTF-8')}",
		"refresh_token=${URLEncoder.encode(refreshToken ?: '', 'UTF-8')}",
		"scope=${URLEncoder.encode(resolvedScope ?: '', 'UTF-8')}"
	].join("&")

	def client   = HttpClient.newHttpClient()
	def request  = HttpRequest.newBuilder()
		.uri(URI.create(resolvedTokenUrl))
		.header("Content-Type", "application/x-www-form-urlencoded")
		.POST(HttpRequest.BodyPublishers.ofString(params))
		.build()
	def response = client.send(request, HttpResponse.BodyHandlers.ofString())

	if (response.statusCode() != 200)
		throw new RuntimeException("OAuth2 token refresh failed (HTTP ${response.statusCode()}): ${response.body()}")

	def json = new JsonSlurper().parseText(response.body())
	if (json.error)
		throw new RuntimeException("OAuth2 token refresh error: ${json.error} — ${json.error_description}")

	return json.access_token as String
}

if (StringUtils.isEmpty(message.htmlMessage))
	message.isHtmlEmail = false
else
	message.isHtmlEmail = true

def commonsEmail

if (message.isHtmlEmail)
	commonsEmail = new ImageHtmlEmail()
else
	commonsEmail = new MultiPartEmail()

// Phase A: Resolve credentials. For OAuth2 we fetch the access token now but defer
// the XOAUTH2 session properties until AFTER host/port/TLS/SSL are set — Commons Email's
// getMailSession() creates the Session lazily and must see those properties at creation time.
def oauth2AccessToken = null
if (message.oauth2provider != null && message.oauth2provider != "NONE") {
	oauth2AccessToken = mintAccessToken(
		message.oauth2provider, message.oauth2tenantid, message.oauth2clientid,
		message.oauth2tokenurl, message.oauth2scope, SecretsCipher.decryptGraceful(message.oauth2refreshtoken))
	commonsEmail.setAuthentication(message.oauth2useremail, oauth2AccessToken)
} else if (message.isAuthentication) {
	commonsEmail.setAuthentication(message.authuser, SecretsCipher.decryptGraceful(message.authpwd))
}

commonsEmail.setHostName(message.hostName)
commonsEmail.setSmtpPort(Integer.parseInt(message.smtpPort))

commonsEmail.setFrom(message.fromAddress, message.fromName)

commonsEmail.setTLS(message.isTls)
commonsEmail.setSSL(message.isSsl)
commonsEmail.setDebug(message.isDebug)

// Phase B: Now that host/port/TLS/SSL are configured, trigger session creation and
// inject XOAUTH2 SASL properties so JavaMail uses Bearer token auth instead of PLAIN/LOGIN.
if (oauth2AccessToken != null) {
	def session = commonsEmail.getMailSession()
	session.properties.put("mail.smtp.auth.mechanisms", "XOAUTH2")
	session.properties.put("mail.smtp.auth.login.disable", "true")
	session.properties.put("mail.smtp.auth.plain.disable", "true")
}

for (path in message.attachments){
	
	EmailAttachment attachment = new EmailAttachment()
	attachment.setPath(path)
	attachment.setDisposition(EmailAttachment.ATTACHMENT)
	commonsEmail.attach(attachment)

}

commonsEmail.setSubject(message.subject)

if (StringUtils.isNotBlank(message.textMessage)) {

	if (!message.isHtmlEmail)
		commonsEmail.setMsg(message.textMessage)
	else
		((ImageHtmlEmail) commonsEmail).setTextMsg(message.textMessage)

}

if (message.isHtmlEmail) {

	def dsResolver = message.ctx.settings.getEmailSettings().dsresolver

	if (StringUtils.isBlank(dsResolver))
		dsResolver = "./templates"

	//<img having href pointing to the web
	//in HTML you'll define an image from the web like this src="https://barefoot5k.com/wp-content/uploads/2014/12/pepsi-logo-300x204.png"
	if (dsResolver.toLowerCase().startsWith("http"))
		((ImageHtmlEmail) commonsEmail).setDataSourceResolver(new DataSourceUrlResolver(new URL(dsResolver.toLowerCase()), true))
	else
		//<img having href pointing to local disk
		((ImageHtmlEmail) commonsEmail).setDataSourceResolver(new DataSourceFileResolver(new File(dsResolver)))
	
	if (StringUtils.isNotBlank(message.htmlMessage)) {
		def modifiedHtml = Utils.ibContent(message.htmlMessage, "Sent by")
		((ImageHtmlEmail) commonsEmail).setHtmlMsg(modifiedHtml)
	}
	
}

for (address in message.tos)
	commonsEmail.addTo(address)

for (address in message.ccs)
	commonsEmail.addCc(address)

for (address in message.bccs)
	commonsEmail.addBcc(address)

if ((!message.sjm) || (!message.sjm.active))
	commonsEmail.send()
else if (message.sjm.active) {	//SimpleJavaMail starts here
	
	commonsEmail.buildMimeMessage()

	def mimeMessage = commonsEmail.getMimeMessage()

	def sjmMailerBuilder = SimpleJavaMailDecorator.getMailerBuilder(mimeMessage)

	// start SimpleJavaMail MailerBuilder configuration
	// see http://www.simplejavamail.org/configuration.html for more details

	if (StringUtils.isNotBlank(message.sjm.customsessionproperties))
		sjmMailerBuilder.withProperties(Utils.loadHeadersPropertiesFromText(message.sjm.customsessionproperties))

	if (oauth2AccessToken != null) {
		def oauth2Props = new Properties()
		oauth2Props.put("mail.smtp.auth.mechanisms", "XOAUTH2")
		oauth2Props.put("mail.smtp.auth.login.disable", "true")
		oauth2Props.put("mail.smtp.auth.plain.disable", "true")
		sjmMailerBuilder.withProperties(oauth2Props)
	}
	
	if (message.sjm.javaxmaildebug)
		sjmMailerBuilder.withDebugLogging()
	if (message.sjm.transportmodeloggingonly)
		sjmMailerBuilder.withTransportModeLoggingOnly()
	
	if (StringUtils.isNotBlank(message.sjm.proxy.host))
		sjmMailerBuilder.withProxyHost(message.sjm.proxy.host)
	if (message.sjm.proxy.port > 0)
		sjmMailerBuilder.withProxyPort(message.sjm.proxy.port)
	if (StringUtils.isNotBlank(message.sjm.proxy.username))
		sjmMailerBuilder.withProxyUsername(message.sjm.proxy.username)
	if (StringUtils.isNotBlank(message.sjm.proxy.password))
		sjmMailerBuilder.withProxyPassword(SecretsCipher.decryptGraceful(message.sjm.proxy.password))
	if (message.sjm.proxy.socks5bridgeport > 0)
		sjmMailerBuilder.withProxyBridgePort(message.sjm.proxy.socks5bridgeport)
	
	// end SimpleJavaMail MailerBuilder configuration

	def sjmEmailBuilder = SimpleJavaMailDecorator.getEmailBuilder(mimeMessage)

	// start SimpleJavaMail EmailBuilder configuration
	// see http://www.simplejavamail.org/features.html for more details

	if (StringUtils.isNotBlank(message.sjm.replytoaddress))
		sjmEmailBuilder.withReplyTo(message.sjm.replytoname, message.sjm.replytoaddress)
	
	if (StringUtils.isNotBlank(message.sjm.bouncetoaddress))
		sjmEmailBuilder.withBounceTo(message.sjm.bouncetoname, message.sjm.bouncetoaddress)
	
	if (StringUtils.isNotBlank(message.sjm.receipttoaddress))
		sjmEmailBuilder.withReturnReceiptTo(message.sjm.receipttoname, message.sjm.receipttoaddress)
	
	if (StringUtils.isNotBlank(message.sjm.dispositionnotificationtoaddress))
		sjmEmailBuilder.withDispositionNotificationTo(message.sjm.dispositionnotificationtoname, message.sjm.dispositionnotificationtoaddress)
	
	if (StringUtils.isNotBlank(message.sjm.customemailheaders))
		sjmEmailBuilder.withHeaders(Utils.loadHeadersPropertiesFromText(message.sjm.customemailheaders))
	
	// end SimpleJavaMail EmailBuilder configuration

	def sjmMailer = sjmMailerBuilder.buildMailer()
	def sjmEmail = sjmEmailBuilder.buildEmail()

	sjmMailer.sendMail(sjmEmail)
	
}