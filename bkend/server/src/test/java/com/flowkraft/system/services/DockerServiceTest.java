package com.flowkraft.system.services;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The Apps screen decides whether an app runs by looking at the containers on the machine. A container
 * from another Compose project must not count, however much its name looks like ours: on a machine that
 * already ran its own CloudBeaver ("ints-cloudbeaver"), the app showed as running and Stop would have
 * stopped that stranger's container.
 */
public class DockerServiceTest {

	private static final String INSTALLATION = "/opt/datapallas";

	@Test
	void aContainerOfAnotherComposeProjectIsForeign() {
		String labels = "com.docker.compose.project=shelf-cloudbeaver,"
				+ "com.docker.compose.project.config_files=/var/other/apps/shelf-cloudbeaver/docker-compose.yml";

		assertThat(DockerService.isForeignComposeContainer(labels, INSTALLATION)).isTrue();
	}

	@Test
	void ourOwnAppContainerIsNotForeign() {
		String labels = "com.docker.compose.project=cloudbeaver,"
				+ "com.docker.compose.project.config_files=/opt/datapallas/_apps/cloudbeaver/docker-compose.yml";

		assertThat(DockerService.isForeignComposeContainer(labels, INSTALLATION)).isFalse();
	}

	@Test
	void windowsPathsAreComparedTheSameWay() {
		String labels = "com.docker.compose.project.config_files=C:\\DataPallas\\_apps\\cloudbeaver\\docker-compose.yml";

		assertThat(DockerService.isForeignComposeContainer(labels, "C:\\DataPallas")).isFalse();
		assertThat(DockerService.isForeignComposeContainer(labels, "C:\\Elsewhere")).isTrue();
	}

	@Test
	void containersWithoutComposeLabelsStayOurs() {
		assertThat(DockerService.isForeignComposeContainer("", INSTALLATION)).isFalse();
		assertThat(DockerService.isForeignComposeContainer(null, INSTALLATION)).isFalse();
		assertThat(DockerService.isForeignComposeContainer("com.example.vendor=acme", INSTALLATION)).isFalse();
	}

	@Test
	void withoutAnInstallationDirectoryNothingIsForeign() {
		String labels = "com.docker.compose.project.config_files=/var/other/docker-compose.yml";

		assertThat(DockerService.isForeignComposeContainer(labels, "")).isFalse();
		assertThat(DockerService.isForeignComposeContainer(labels, null)).isFalse();
	}
}
