// Jenkins startup script: sets the Jenkins URL (Manage Jenkins -> System -> Jenkins URL) at every start of Jenkins.
// Jenkins sits behind the reverse proxy and Authelia, so it does not know its public address by itself: without this it
// builds its links (BUILD_URL and JOB_URL, the build links the Jenkinsfiles print, the redirects after a login or a
// Build press) from what it sees inside the container. Once saved the value stays; this script puts it back when the
// field is cleared in the UI, and sets it on a fresh Jenkins home.
//
// The live copy is <Jenkins home>/init.groovy.d/location.groovy (on this host, in the container ints-jenkins:
// /var/jenkins_home/init.groovy.d/). After a change here, copy it there and restart Jenkins:
//   docker cp asbl/ci/jenkins/init.groovy.d/location.groovy ints-jenkins:/var/jenkins_home/init.groovy.d/location.groovy
// (asbl/ci/jenkins/jenkins.md, "Setting it up").
import jenkins.model.JenkinsLocationConfiguration
def c = JenkinsLocationConfiguration.get()
c.setUrl("https://jenkins.bkstg.flowkraft.com/")
c.save()
