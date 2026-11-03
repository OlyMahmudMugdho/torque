import type { ProjectFile } from '../types/workspace';

export type ProjectTemplateId = 'empty' | 'article' | 'ieee' | 'beamer' | 'report';

export interface ProjectTemplateConfig {
  id: ProjectTemplateId;
  name: string;
  description: string;
  docClass: string;
  defaultRoot: string;
}

export interface NewProjectFormValues {
  name: string;
  templateId: ProjectTemplateId;
  fontSize: '10pt' | '11pt' | '12pt';
  paperSize: 'letterpaper' | 'a4paper';
  createGitRepo: boolean;
  generateSample: boolean;
}

export const PROJECT_TEMPLATES: ProjectTemplateConfig[] = [
  {
    id: 'empty',
    name: 'Empty Project',
    description: 'Minimal blank LaTeX starter file',
    docClass: 'article',
    defaultRoot: 'main.tex',
  },
  {
    id: 'article',
    name: 'LaTeX Article',
    description: 'Standard academic and scientific article with amsmath & geometry',
    docClass: 'article',
    defaultRoot: 'main.tex',
  },
  {
    id: 'ieee',
    name: 'Conference Paper (IEEE)',
    description: 'Standard IEEEtran double-column conference publication template',
    docClass: 'IEEEtran',
    defaultRoot: 'main.tex',
  },
  {
    id: 'beamer',
    name: 'Presentation (Beamer)',
    description: 'Slide deck presentation with Madrid theme and outline frames',
    docClass: 'beamer',
    defaultRoot: 'main.tex',
  },
  {
    id: 'report',
    name: 'Book / Technical Report',
    description: 'Multi-chapter document structure with table of contents',
    docClass: 'report',
    defaultRoot: 'main.tex',
  },
];

export function scaffoldProjectFiles(values: NewProjectFormValues): {
  files: Omit<ProjectFile, 'projectId' | 'updatedAt'>[];
  rootEntry: string;
} {
  const { name, templateId, fontSize, paperSize, createGitRepo, generateSample } = values;
  const files: Omit<ProjectFile, 'projectId' | 'updatedAt'>[] = [];

  let content = '';

  switch (templateId) {
    case 'empty':
      content = `\\documentclass[${fontSize}]{article}
\\usepackage[utf8]{inputenc}

\\begin{document}

\\section{Introduction}
Welcome to your LaTeX document in Torque!

\\end{document}
`;
      break;

    case 'article':
      content = `\\documentclass[${fontSize},${paperSize}]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{${name}}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
This is the abstract for the article prepared in Torque LaTeX IDE.
\\end{abstract}

\\section{Introduction}
Welcome to your new LaTeX article. Torque compiles documents completely in the browser via WebAssembly.

${
  generateSample
    ? `\\section{Mathematics and Equations}
Here is an example equation:
\\begin{equation}
E = mc^2 \\quad \\text{and} \\quad \\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
\\end{equation}

\\section{Results}
Discuss your experimental observations and empirical results here.
`
    : ''
}
\\section{Conclusion}
Summary of research findings and concluding remarks.

\\end{document}
`;
      break;

    case 'ieee':
      content = `\\documentclass[conference,${fontSize},${paperSize}]{IEEEtran}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{cite}

\\title{${name}}

\\author{\\IEEEauthorblockN{First Author}
\\IEEEauthorblockA{\\textit{Department of Computer Science} \\\\
\\textit{Institution / University}\\\\
City, Country \\\\
author@example.com}}

\\begin{document}
\\maketitle

\\begin{abstract}
This conference paper demonstrates publication-ready formatting using the IEEEtran class in Torque.
\\end{abstract}

\\begin{IEEEkeywords}
LaTeX, WebAssembly, IEEEtran, Client-Side Typesetting
\\end{IEEEkeywords}

\\section{Introduction}
Modern client-side LaTeX authoring enables instant compilation with zero cloud dependencies.

${
  generateSample
    ? `\\section{Methodology}
We describe the architectural design and implementation principles.

\\section{Evaluation}
Performance metrics and empirical comparisons demonstrate near-instant feedback.
`
    : ''
}
\\section{Conclusion}
Summary of contributions and recommendations for future study.

\\end{document}
`;
      break;

    case 'beamer':
      content = `\\documentclass[${fontSize}]{beamer}
\\usetheme{Madrid}
\\usecolortheme{default}

\\title{${name}}
\\subtitle{Presentation with Torque LaTeX}
\\author{Presenter Name}
\\institute{Institution / Organization}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Outline}
  \\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{Introduction}
  \\begin{itemize}
    \\item 100\\% Client-Side WebAssembly LaTeX engine
    \\item JetBrains IntelliJ New UI aesthetics
    \\item Zero server compilation round-trips
  \\end{itemize}
\\end{frame}

${
  generateSample
    ? `\\section{Key Features}
\\begin{frame}{Key Features}
  \\begin{block}{Instant Local Preview}
    Documents compile directly in a Web Worker without blocking the editor.
  \\end{block}
  \\begin{alertblock}{Offline Ready}
    Works offline in any standard modern web browser or native desktop app.
  \\end{alertblock}
\\end{frame}
`
    : ''
}
\\begin{frame}{Conclusion}
  \\centering
  \\Huge Thank You!
\\end{frame}

\\end{document}
`;
      break;

    case 'report':
      content = `\\documentclass[${fontSize},${paperSize}]{report}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{geometry}
\\geometry{margin=1.2in}

\\title{${name}}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Introduction}
\\section{Overview}
This is the first chapter of your technical report or book.

${
  generateSample
    ? `\\chapter{System Architecture}
\\section{Design Overview}
Comprehensive explanation of system subsystems and components.

\\chapter{Results}
\\section{Experimental Validation}
Detailed evaluation and discussion of data.
`
    : ''
}
\\chapter{Conclusions}
\\section{Final Remarks}
Summary of key conclusions and future work.

\\end{document}
`;
      break;
  }

  files.push({
    path: 'main.tex',
    content,
    isBinary: false,
  });

  if (createGitRepo) {
    files.push({
      path: '.gitignore',
      content: `*.aux
*.log
*.out
*.toc
*.nav
*.snm
*.vrb
*.synctex.gz
*.fls
*.fdb_latexmk
`,
      isBinary: false,
    });
  }

  return {
    files,
    rootEntry: 'main.tex',
  };
}
