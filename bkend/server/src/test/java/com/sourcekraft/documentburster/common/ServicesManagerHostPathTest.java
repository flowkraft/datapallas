package com.sourcekraft.documentburster.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import java.lang.reflect.Method;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.jupiter.api.Test;

import com.sourcekraft.documentburster.utils.Utils;

/**
 * Apps started from the shipped Docker server need their bind mounts written as host paths, because the
 * daemon that reads them is the host's. Everywhere else - Electron, and a Server on the host JVM on
 * Windows or Linux - Compose has to be called exactly as it always was, including on a machine with no
 * Docker at all, where asking the daemon anything would be a stray process and an error in the log.
 *
 * That is one decision, taken in the first line of hostPathOf, and this pins it down.
 */
public class ServicesManagerHostPathTest {

	@Test
	void outsideDockerNothingIsTranslatedAndNothingIsAsked() throws Exception {
		assumeFalse(Utils.isRunningInDocker(), "this JVM runs in the DataPallas Docker image");

		Method hostPathOf = ServicesManager.class.getDeclaredMethod("hostPathOf", Path.class);
		hostPathOf.setAccessible(true);

		assertThat(hostPathOf.invoke(null, Paths.get("/opt/datapallas/_apps/matomo"))).isNull();
	}
}
