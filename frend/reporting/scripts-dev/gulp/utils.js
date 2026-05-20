const gulp = require("gulp");
const jetpack = require("fs-jetpack");
const { childProcess, spawn } = require("child_process");
const kill = require("tree-kill");

const argv = require("minimist")(process.argv);

const through = require("through2");
const PluginError = require("plugin-error");

const getUrls = require("get-urls");
const syncHTTPRequest = require("sync-request");

const FRONTEND_PLAYGROUND_FOLDER_PATH = "./testground";

exports.getEnvName = () => {
  return argv.env || "development";
};

exports.beepSound = () => {
  process.stdout.write("\u0007");
};

gulp.task("utils:start-server-and-ui-both", () => {
  _startServerAndDoX("_custom:start-ui-both");
});

gulp.task("utils:start-server-and-ui-web", () => {
  _startServerAndDoX("_custom:start-ui-web");
});

gulp.task("utils:start-server-and-ui-electron", () => {
  _startServerAndDoX("_custom:start-ui-electron");
});

// Same shape as the -electron task above, but uses the production esbuild
// build (`electron:local` = `build:prod && electron .`) instead of `ng serve`.
// Use this while the Vite-backed `ng serve` lane is blocked upstream by
// tailwindlabs/tailwindcss#16964 (Tailwind v4 @plugin directive mangled by
// Vite's CSS pipeline). Trade-off: no HMR — every change requires a fresh
// build:prod (~15s on esbuild). Backend / Java orchestration is identical.
gulp.task("utils:start-server-and-ui-electron-local", () => {
  _startServerAndDoX("_custom:start-ui-electron-local");
});

gulp.task("utils:start-server-and-e2e-electron", () => {
  _startServerAndDoX("_custom:playwright-scripts-electron");
});

gulp.task("utils:start-server-and-e2e-web", () => {
  _startServerAndDoX("_custom:playwright-scripts-web");
});

gulp.task("utils:start-javano-chocono-and-ui", () => {
  const chocoStatus = "not-installed";
  _startJavaNoAndUI(chocoStatus);
});

gulp.task("utils:start-javano-chocoyes-and-ui", () => {
  const chocoStatus = "installed";
  _startJavaNoAndUI(chocoStatus);
});

gulp.task("utils:start-java8-chocoyes-and-ui", () => {
  const javaVersion = "1.8.0_412";
  const chocoStatus = "installed";
  _startJavaYesAndUI(javaVersion, chocoStatus);
});

gulp.task("utils:start-java8-chocono-and-ui", () => {
  const javaVersion = "1.8.0_412";
  const chocoStatus = "not-installed";
  _startJavaYesAndUI(javaVersion, chocoStatus);
});

gulp.task("utils:start-java17-chocoyes-and-ui", () => {
  const javaVersion = "17.0.16";
  const chocoStatus = "installed";
  _startJavaYesAndUI(javaVersion, chocoStatus);
});

gulp.task("utils:start-java17-chocono-and-ui", () => {
  const javaVersion = "17.0.16";
  const chocoStatus = "not-installed";
  _startJavaYesAndUI(javaVersion, chocoStatus);
});

gulp.task("utils:show-stats-memory", () => {
  const maxHeapSz = require("v8").getHeapStatistics().heap_size_limit;
  const maxHeapSz_GB = (maxHeapSz / 1024 ** 3).toFixed(1);

  console.log("--------------------------");
  console.log(`${maxHeapSz_GB}GB`);

  return Promise.resolve(`${maxHeapSz_GB}GB`);
});

gulp.task("utils:check-broken-links", () => {
  return gulp.src("src/**/*.html").pipe(_checkBrokenLinks());
});

_startJavaYesAndUI = async (javaVersion, chocoStatus) => {
  const rbsjExeLogPath = "testground/e2e/logs/rbsj-exe.log";
  await jetpack.writeAsync(rbsjExeLogPath, "");
  await jetpack.writeAsync(rbsjExeLogPath, `openjdk version "17.0.14" 2025-01-21
OpenJDK Runtime Environment Temurin-17.0.14+7 (build 17.0.14+7)
OpenJDK 64-Bit Server VM Temurin-17.0.14+7 (build 17.0.14+7, mixed mode, sharing)
Started ServerApplication with PID 13404`);

  const electronLogPath = "testground/e2e/logs/electron.log";
  await jetpack.writeAsync(electronLogPath, "");
  let chocoLogMessage = "bla bla\n'choco' is not recognized";
  if (chocoStatus != "not-installed") chocoLogMessage = "0.11.2\nbla bla";

  await jetpack.writeAsync(electronLogPath, chocoLogMessage);

  const electronProcess = spawn("npm", ["run", "_custom:start-ui-electron"], {
    stdio: "inherit", // Changed from "pipe" to "inherit" to show output
    shell: true,
  });

  electronProcess.stdout.on("data", (data) => {
    console.log(`Electron: ${data}`);
  });

  electronProcess.stderr.on("data", (data) => {
    console.error(`Electron Error: ${data}`);
  });
};

_startJavaNoAndUI = async (chocoStatus) => {
  const rbsjExeLogPath = "testground/e2e/logs/rbsj-exe.log";
  await jetpack.writeAsync(rbsjExeLogPath, "");
  const javaLogMessage = "bla bla\n'java' is not recognized";
  await jetpack.writeAsync(rbsjExeLogPath, javaLogMessage);

  const electronLogPath = "testground/e2e/logs/electron.log";
  await jetpack.writeAsync(electronLogPath, "");
  let chocoLogMessage = "bla bla\n'choco' is not recognized";
  if (chocoStatus != "not-installed")
    chocoLogMessage = "bla bla\nchoco version: 0.11.2";

  await jetpack.writeAsync(electronLogPath, chocoLogMessage);

  try {
    const electronProcess = spawn("npm", ["run", "_custom:start-ui-electron"], {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        DEBUG: "true",
        //NODE_OPTIONS: "--inspect=9230"  // Changed to port 9230
      },
    });

    if (electronProcess) {
      electronProcess.stdout?.on("data", (data) => {
        console.log(`Electron: ${data}`);
      });

      electronProcess.stderr?.on("data", (data) => {
        console.error(`Electron Error: ${data}`);
      });
    } else {
      console.error("Failed to start electron process");
    }
  } catch (error) {
    console.error("Error starting electron process:", error);
  }
};

_startServerAndDoX = (npm_x_script) => {
  const server = spawn("npm", ["run", "_custom:start-server"], {
    stdio: "pipe",
    shell: true,
  });

  // Create a flag to ensure we only start the tests once
  let testProcessStarted = false;
  let serverKilled = false;

  server.stdout.on("data", (data) => {

    if (!data.includes("destination=/topic/execution-stats") && !data.includes("SimpleBrokerMessageHandler")) {
      console.log(`stdout: ${data}`);
    }

    // Only start the test process once, no matter how many times this matches
    if (
      !testProcessStarted &&
      //data.includes("org.apache.coyote.AbstractProtocol start")
      data.toString().toLowerCase().includes("started serverapplication")
    ) {
      testProcessStarted = true; // Set the flag immediately
      console.log(
        `stdout: ${data} !!!!!! ====>>>>> starting 'npm run "${npm_x_script}"'`,
      );

      // Create a lock file to ensure other processes know tests are running
      const lockfile = require("lockfile");
      const path = require("path");
      // Use the existing constant for consistency
      const lockPath = path.join(
        FRONTEND_PLAYGROUND_FOLDER_PATH,
        "e2e/temp/playwright.lock",
      );

      // Try to create the lock - if it exists, it means another process is already running tests
      lockfile.lock(lockPath, { stale: 60000 }, (err) => {
        if (err) {
          console.error(
            "Another test process is already running! Exiting this one.",
          );
          kill(server.pid, () => {
            console.error(
              `DONE: SpringBoot Server was killed (duplicate run prevented)`,
            );
            process.exit(1);
          });
          return;
        }

        // We got the lock, proceed with tests
        console.log("Got exclusive lock, starting tests...");

        const npmXScriptSpawned = spawn("npm", ["run", npm_x_script], {
          stdio: "pipe",
          shell: true,
        });

        npmXScriptSpawned.stdout.on("data", (data) => {
          console.log(`stdout: ${data}`);
        });

        npmXScriptSpawned.stderr.on("data", (data) => {
          console.error(`stderr: ${data}`);
        });

        npmXScriptSpawned.on("close", (code) => {
          console.log(`Main Playwright process exited with code ${code}`);

          // Use find-process to check for any remaining Playwright processes
          const findProcess = require("find-process");

          const checkForPlaywrightProcesses = () => {
            findProcess("name", "playwright").then((list) => {
              // Filter to ensure we're only looking at our own test processes
              const relevantProcesses = list.filter(
                (p) => p.cmd.includes("playwright") && p.cmd.includes("e2e"),
              );

              if (relevantProcesses.length > 0) {
                console.log(
                  `${relevantProcesses.length} Playwright processes still running. Waiting...`,
                );
                setTimeout(checkForPlaywrightProcesses, 1000);
              } else {
                if (!serverKilled) {
                  serverKilled = true;
                  console.log(
                    "All Playwright processes have completed. Shutting down server...",
                  );

                  // Release the lock file first
                  lockfile.unlock(lockPath, (err) => {
                    if (err) console.error("Error releasing lock:", err);

                    kill(server.pid, () => {
                      console.error(`DONE: SpringBoot Server was killed`);
                    });
                  });
                }
              }
            });
          };

          checkForPlaywrightProcesses();
        });
      });
    }
  });

  server.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
  });

  server.on("close", (code) => {
    console.log(`server exited with code ${code}`);
  });
};

_checkBrokenLinks = () => {
  const shouldWorkUrlsButCuriouslyTheyDont = [
    "https://www.joomla.org",
    "https://www.drupal.org",
    "http://www.sharepoint.com",
  ];

  const excludeUrls = [
    "https://portal.pdfburst.com/wp-json/pods/invoices",
    "http://www.example.com/",
    "https://sharepointserver.com/reports",
    "http://example.com",
    "https://s3.amazonaws.com/documentburster/newest/documentburster.zip",
  ];

  var stream = through.obj(function (file, enc, callback) {
    if (file.isStream()) {
      throw new PluginError(
        "gulp-check-broken-links",
        "streams not implemented",
      );
    } else if (file.isBuffer()) {
      var contents = String(file.contents);

      var urls = getUrls(contents, {
        normalizeProtocol: false,
        stripWWW: false,
      });

      if (urls) {
        urls.forEach(function (externalUrl) {
          if (
            externalUrl.startsWith("http") &&
            excludeUrls.indexOf(externalUrl) == -1 &&
            shouldWorkUrlsButCuriouslyTheyDont.indexOf(externalUrl) == -1
          ) {
            console.log(
              "externalUrl : " + externalUrl + ", file : " + file.relative,
            );

            var res = syncHTTPRequest("GET", externalUrl);
            console.log(res.statusCode);
            if (res.statusCode >= 400)
              throw new PluginError(
                "gulp-check-broken-links",
                "Found broken link: " +
                  externalUrl +
                  " in file: " +
                  file.relative,
              );
          }
        });
      }
    }

    this.push(file);
    return callback();
  });

  return stream;
};

gulp.task("utils:generate-icons-if-needed", async () => {
  // Finds existing icon
  var iconExist = await jetpack.existsAsync(
    `${FRONTEND_PLAYGROUND_FOLDER_PATH}/icons/win/icon.ico`,
  );

  //if-needed
  if (iconExist === false) {
    return childProcess
      .spawn("cmd.exe", ["/c", "npm run npm run custom:icons-iconmaker"], {
        stdio: "inherit",
      })
      .on("close", () => {
        process.exit();
      });
  }

  return Promise.resolve(
    "utils:generate-icons-if-needed- Nothing to do, Icons stuff already present.",
  );
});
