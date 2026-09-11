# Drop your own jars here

Anything in this folder is mounted into the renderer automatically — no rebuild,
no configuration, no restart. Copy a `.jar` in, run `jr.bat` again, and it is on
the classpath.

It is mounted read-only at `/opt/jr/userlib`, **ahead of** the bundled jars, so a
report built against your version of a library gets your version of it.

## What belongs here

| You have | Symptom without it |
|---|---|
| **Report scriptlets** — the jar behind `scriptletClass="com.acme.PayslipScriptlet"` | `JRException: Error loading scriptlet class` |
| **Custom data sources** — your `JRDataSource` / query executer implementations | `ClassNotFoundException` during fill |
| **Custom functions** — classes your expressions call | compile error naming the class |
| **Corporate font extensions** — the font jar from your old JasperReports Server | `JRFontNotFoundException: Font "..." is not available to the JVM` |
| **Licence-restricted JDBC drivers** — Oracle, DB2, and anything else not redistributable | `No suitable driver found for jdbc:...` |

Every one of these is a jar you already own: it is sitting in your existing
application or on your old report server. There is nothing to write.

## Fonts

Two different things are called fonts here, and they fail differently.

* A **font extension jar** (one holding `jasperreports_extension.properties` and
  `.ttf` files) goes in this folder. That is how JasperReports Server shipped
  corporate fonts, and the same jar works unchanged.
* A **bare `.ttf`** is not a font extension and will not be picked up by dropping
  it here. Either wrap it in a font-extension jar with Jaspersoft Studio, or
  change the report to name a font that is present.

DejaVu and the standard logical fonts (SansSerif, Serif, Monospaced) are already
in the image — you do not need to supply those.

## Checking what got picked up

If a jar seems to be ignored, confirm it reached the container:

```bash
docker run --rm -v "<full path to this lib folder>:/opt/jr/userlib:ro" \
  --entrypoint ls flowkraft/datapallas-jasper-legacy:6.21.5 -l /opt/jr/userlib
```

The usual cause of a jar being "ignored" is a nested folder — only jars sitting
directly in this folder are on the classpath, not ones in subfolders.
