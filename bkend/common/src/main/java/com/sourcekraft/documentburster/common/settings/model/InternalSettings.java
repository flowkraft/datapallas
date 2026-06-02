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
package com.sourcekraft.documentburster.common.settings.model;

import com.sourcekraft.documentburster.utils.DumpToString;

public class InternalSettings extends DumpToString {

    public String theme;
    public String backendurl;
    public String copiloturl;

    // runtime: windows | linux | docker
    public String runtime;

    // When true, CRUD list views (Connections, Reports, Cube Definitions)
    // also display bundled sample entries (Northwind DB connections,
    // sample reports under config/samples*, sample cubes under config/samples-cubes).
    // Default false. Sample entries are read-only.
    public Boolean showsamples;

}
