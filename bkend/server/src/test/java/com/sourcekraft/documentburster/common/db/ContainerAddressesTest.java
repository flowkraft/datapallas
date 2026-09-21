package com.sourcekraft.documentburster.common.db;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * A database saved as localhost:3307 is on the user's machine when DataPallas runs on it, and one hop away
 * when DataPallas runs in the shipped Docker server: there localhost is the container. The mapping comes
 * from Docker itself, and this pins down how its answer is read (plan §4 F2n).
 */
public class ContainerAddressesTest {

	/** `docker ps --format "{{.Names}}\t{{.Ports}}\t{{.Networks}}"`, as Docker prints it. */
	private static final String DOCKER_PS = String.join("\n",
			"rb-northwind-postgres\t0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp\tdatapallas",
			"rb-northwind-mariadb\t0.0.0.0:3307->3306/tcp, [::]:3307->3306/tcp\tdatapallas",
			"datapallas-server\t0.0.0.0:9090->9090/tcp, [::]:9090->9090/tcp\tdatapallas",
			"someone-elses-postgres\t0.0.0.0:6543->5432/tcp\tbridge",
			"an-app-on-two-networks\t0.0.0.0:8440->8440/tcp\tai-hub-network,datapallas",
			"some-container-without-ports\t\tdatapallas");

	@Test
	void theContainerPublishingThePortIsFoundByNameAndItsOwnPort() {
		assertThat(ContainerAddresses.parse(DOCKER_PS, "3307")).isEqualTo("rb-northwind-mariadb:3306");
	}

	@Test
	void aPortThatIsPublishedUnchangedStillGivesTheContainerName() {
		assertThat(ContainerAddresses.parse(DOCKER_PS, "5432")).isEqualTo("rb-northwind-postgres:5432");
	}

	@Test
	void aPortNobodyPublishesHasNoContainer() {
		assertThat(ContainerAddresses.parse(DOCKER_PS, "1521")).isNull();
	}

	@Test
	void theHostPortIsMatched_notTheContainerPort() {
		// 3306 is mariadb's port INSIDE its container; nothing publishes 3306 on the host
		assertThat(ContainerAddresses.parse(DOCKER_PS, "3306")).isNull();
	}

	@Test
	void nothingAtAllIsReadFromEmptyOutput() {
		assertThat(ContainerAddresses.parse("", "3307")).isNull();
		assertThat(ContainerAddresses.parse(null, "3307")).isNull();
	}

	@Test
	void aContainerOnAnotherNetworkIsNotOursToNameEvenWhenItPublishesThePort() {
		// nothing on our network publishes 6543, so that one belongs to the user's machine and keeps the
		// host-gateway route; naming it would address a container the renderer cannot reach
		assertThat(ContainerAddresses.parse(DOCKER_PS, "6543")).isNull();
	}

	@Test
	void aContainerThatAlsoHasItsOwnNetworkStillCounts() {
		assertThat(ContainerAddresses.parse(DOCKER_PS, "8440")).isEqualTo("an-app-on-two-networks:8440");
	}

	@Test
	void outsideDockerAnAddressIsNeverTouched() {
		// the test JVM does not run in the DataPallas image, so this is the desktop / host-JVM case
		assertThat(ContainerAddresses.resolve("localhost", "3307")).containsExactly("localhost", "3307");
		assertThat(ContainerAddresses.resolve("db.example.com", "3307")).containsExactly("db.example.com", "3307");
	}

	/** the answer resolve() gives in the Docker server when billing-portal-grails publishes 8500 */
	private static String[] portal(String host, String port) {
		return "8500".equals(port) ? new String[] { "billing-portal-grails", "8080" }
				: new String[] { ContainerAddresses.HOST_GATEWAY, port };
	}

	@Test
	void aLocalhostUrlInAnUploadCommandIsReAddressed() {
		String curl = "-X POST -H \"Content-Type: application/json\" --data-binary @\"out/1.json\" \"http://localhost:8500/api/invoices\"";
		assertThat(ContainerAddresses.resolveUrlsIn(curl, ContainerAddressesTest::portal)).isEqualTo(
				"-X POST -H \"Content-Type: application/json\" --data-binary @\"out/1.json\" \"http://billing-portal-grails:8080/api/invoices\"");
	}

	@Test
	void everyLocalhostUrlIsReAddressedAndUserInfoIsKept() {
		assertThat(ContainerAddresses.resolveUrlsIn("-T f ftp://u:p@127.0.0.1:21/in/ http://LOCALHOST:8500/x",
				ContainerAddressesTest::portal))
				.isEqualTo("-T f ftp://u:p@host.docker.internal:21/in/ http://billing-portal-grails:8080/x");
	}

	@Test
	void otherHostsAndPortlessUrlsAreLeftAlone() {
		String curl = "https://portal.example.com:8500/api http://localhost/api -u localhost:8500";
		assertThat(ContainerAddresses.resolveUrlsIn(curl, ContainerAddressesTest::portal)).isEqualTo(curl);
		assertThat(ContainerAddresses.resolveUrlsIn(null, ContainerAddressesTest::portal)).isNull();
	}

	@Test
	void outsideTheDockerServerTheCommandIsUnchanged() {
		// the desktop / host-JVM answer of resolve(): the address as saved
		String curl = "\"http://localhost:8500/api/invoices\"";
		assertThat(ContainerAddresses.resolveUrlsIn(curl, (h, p) -> new String[] { h, p })).isEqualTo(curl);
	}
}
