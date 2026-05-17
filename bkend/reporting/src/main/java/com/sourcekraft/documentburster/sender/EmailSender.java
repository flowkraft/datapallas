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
import org.apache.commons.lang3.StringUtils;

import com.sourcekraft.documentburster.context.BurstingContext;
import com.sourcekraft.documentburster.sender.factory.EmailMessageFactory;
import com.sourcekraft.documentburster.sender.model.EmailMessage;

public class EmailSender extends AbstractSender {

	public EmailSender(boolean execute, BurstingContext ctx) {
		super(execute, ctx);
	}

	protected void doSend() throws Exception {

		EmailMessage message = (new EmailMessageFactory()).createEmailMessage(ctx, ctx.isQARunningMode);

		log.info("Sending email with attachments " + ctx.attachments + " TO : " + message.tos + ", CC : " + message.ccs
				+ ", BCC: " + message.bccs);

		if (ctx.isQARunningMode)
			FileUtils.writeStringToFile(new File(ctx.outputFolder + "/quality-assurance/" + ctx.token + "_email.txt"),
					message.toString(), "UTF-8");

		if (execute) {
			scripting.executeSenderScript(ctx.scripts.email, message);
		}

		if (ctx.isQARunningMode)
			log.info("(Running in QA Mode) Email with attachments " + ctx.attachments + " was sent successfully TO : "
					+ message.tos + ", CC : " + message.ccs + ", BCC: " + message.bccs
					+ " (emails and upload commands are only logged if you run QA for all the burst tokens found in the report)");
		else
			log.info("Email with attachments " + ctx.attachments + " was sent successfully TO : " + message.tos
					+ ", CC : " + message.ccs + ", BCC: " + message.bccs);

	}

}
