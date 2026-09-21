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
import com.sourcekraft.documentburster.common.settings.model.UploadSettings;
import com.sourcekraft.documentburster.common.db.ContainerAddresses;
import com.sourcekraft.documentburster.utils.Utils;

public class UploadSender extends AbstractSender {

	public UploadSender(boolean execute, BurstingContext ctx) {
		super(execute, ctx);
	}

	public static enum UploadType {
		FTP, FILESHARE, FTPS, SFTP, HTTP, CLOUD
	}

	UploadType type;

	public void setType(UploadType type) {
		this.type = type;
	}

	protected void doSend() throws Exception {

		UploadMessage uploadMessage = new UploadMessage();

		uploadMessage.token = ctx.token;

		uploadMessage.ctx = ctx;

		UploadSettings uploadSettings = ctx.settings.getUploadSettings();
		String typeStr = "ftp";

		switch (type) {
		case FTP:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.ftpcommand, ctx.variables,
					ctx.token);
			typeStr = "ftp";
			break;
		case FILESHARE:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.filesharecommand, ctx.variables,
					ctx.token);
			typeStr = "fileshare";
			break;
		case FTPS:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.ftpscommand, ctx.variables,
					ctx.token);
			typeStr = "ftps";
			break;
		case SFTP:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.sftpcommand, ctx.variables,
					ctx.token);
			typeStr = "sftp";
			break;
		case HTTP:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.httpcommand, ctx.variables,
					ctx.token);
			typeStr = "http";
			break;
		case CLOUD:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.cloudcommand, ctx.variables,
					ctx.token);
			typeStr = "cloud";
			break;
		default:
			uploadMessage.uploadCommand = Utils.getStringFromTemplate(uploadSettings.ftpcommand, ctx.variables,
					ctx.token);
			typeStr = "ftp";
			break;
		}

		log.info("Uploading " + ctx.attachments + " using command " + uploadMessage.uploadCommand);

		if (ctx.isQARunningMode)
			FileUtils.writeStringToFile(
					new File(ctx.outputFolder + "/quality-assurance/" + ctx.token + "_" + typeStr + "_upload.txt"),
					uploadMessage.toString(), "UTF-8");

		if (execute) {
			// dialled from where this JVM runs - in the Docker server a localhost URL is another container
			uploadMessage.uploadCommand = ContainerAddresses.resolveUrlsIn(uploadMessage.uploadCommand);
			scripting.executeSenderScript(ctx.scripts.upload, uploadMessage);
		}

		log.info("Attachments " + ctx.attachments + " uploaded successfully.");

	}

}
