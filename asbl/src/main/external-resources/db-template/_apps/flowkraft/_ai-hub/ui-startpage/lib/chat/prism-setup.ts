// Side-effect import hub: registers every Prism grammar (and the theme) the chat
// renderer uses, so `Prism.languages.<lang>` is available wherever the shared
// MarkdownCode / PlantUmlDiagram run. Import this module for its side effects only.
//
// prismjs CORE must be imported FIRST: the `components/prism-*` grammar files augment a
// global `Prism`, and the core is what creates it (in Node it sets `global.Prism` — their
// own "hack for components to work correctly in node.js"). Without core-first, the grammars
// throw `ReferenceError: Prism is not defined` during Next's server prerender, because this
// module is reached via ChatAgentPage BEFORE MarkdownCode's own `import Prism from "prismjs"`.
import "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-groovy";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-java";
import "prismjs/components/prism-sql";
import "@/lib/prism-plantuml";
