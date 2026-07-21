# How overrides work

This file arrived in the app root via `_custom/overrides/` — proof the mechanism ran.

Every file you put under `_custom/overrides/` is copied over the scaffolded app on
**every** run of the app-seed script, preserving relative paths:

    _custom/overrides/docker-compose.yml                -> docker-compose.yml
    _custom/overrides/grails-app/conf/application.yml   -> grails-app/conf/application.yml
    _custom/overrides/grails-app/views/portal/index.gsp -> grails-app/views/portal/index.gsp

Use it to customize the blueprint at exactly the points you care about — datasource
config, views, controllers — while keeping your changes in one small, re-appliable
folder. To re-scaffold from a clean slate: delete everything in the app folder
EXCEPT `_custom/`, then run the seed script again.

Safe to delete this file.
