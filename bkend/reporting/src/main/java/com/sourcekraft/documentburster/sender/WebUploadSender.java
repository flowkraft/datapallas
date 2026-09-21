/*
    DocumentBurster is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    DocumentBurster is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with DocumentBurster.  If not, see <http://www.gnu.org/licenses/>
 */
package com.sourcekraft.documentburster.sender;

import java.io.File;

import org.apache.commons.io.FileUtils;

import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.sender.model.UploadMessage;
import com.sourcekraft.documentburster.common.settings.model.WebUploadSettings;
import com.sourcekraft.documentburster.common.db.ContainerAddresses;
import com.sourcekraft.documentburster.utils.Utils;

public class WebUploadSender extends AbstractSender {

	public WebUploadSender(boolean execute, BurstingContext ctx) {
		super(execute, ctx);
	}

	public static enum UploadType {
		DOCUMENTBURSTERWEB, MSSHAREPOINT, WORDPRESS, DRUPAL, JOOMLA, OTHERWEB
	}

	UploadType type;

	public void setType(UploadType type) {
		this.type = type;
	}

	protected void doSend() throws Exception {

		UploadMessage message = new UploadMessage();
		message.token = ctx.token;

		WebUploadSettings webUploadSettings = ctx.settings.getWebUploadSettings();
		String typeStr = "documentbursterweb";

		switch (type) {
		case DOCUMENTBURSTERWEB:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.documentbursterwebcommand,
					ctx.variables, ctx.token);
			typeStr = "documentbursterweb";
			break;
		case MSSHAREPOINT:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.mssharepointcommand, ctx.variables,
					ctx.token);
			typeStr = "mssharepoint";
			break;
		case WORDPRESS:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.wordpresscommand, ctx.variables,
					ctx.token);
			typeStr = "wordpress";
			break;
		case DRUPAL:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.drupalcommand, ctx.variables,
					ctx.token);
			typeStr = "drupal";
			break;
		case JOOMLA:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.joomlacommand, ctx.variables,
					ctx.token);
			typeStr = "joomla";
			break;
		case OTHERWEB:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.otherwebcommand, ctx.variables,
					ctx.token);
			typeStr = "otherweb";
			break;

		default:
			message.uploadCommand = Utils.getStringFromTemplate(webUploadSettings.documentbursterwebcommand,
					ctx.variables, ctx.token);
			typeStr = "documentbursterweb";
			break;
		}

		log.info("Web-Uploading " + ctx.attachments + " using command " + message.uploadCommand);

		if (ctx.isQARunningMode)
			FileUtils.writeStringToFile(new File(
					ctx.outputFolder + "/quality-assurance/" + ctx.token + "_" + typeStr + "_documents2webupload.txt"),
					message.toString(), "UTF-8");

		if (execute) {
			// dialled from where this JVM runs - in the Docker server a localhost URL is another container
			message.uploadCommand = ContainerAddresses.resolveUrlsIn(message.uploadCommand);
			scripting.executeSenderScript(ctx.scripts.webUpload, message);
		}

		log.info("Attachments " + ctx.attachments + " web-uploaded successfully.");

	}

}
