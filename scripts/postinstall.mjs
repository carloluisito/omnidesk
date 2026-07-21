// Prints a heads-up banner for end users who run `npm install
// @carloluisito/omnidesk` (or `npm i -g ...`) thinking it's an installable
// app rather than the source tree.
//
// This must NOT fire for:
//   - CI (`npm ci` in workflows) — `CI` is set by GitHub Actions and every
//     other major CI provider.
//   - Local dev / contributors running `npm install` at the repo root —
//     npm sets INIT_CWD to the directory the install was invoked from, which
//     equals process.cwd() (this package's own directory) in that case.
if (process.env.CI) process.exit(0);
if (process.env.INIT_CWD && process.env.INIT_CWD === process.cwd()) process.exit(0);

console.log(
  `\n⚠️  OmniDesk is a desktop application.\n\nYou've installed the SOURCE CODE. To get the INSTALLABLE APP:\n→ https://github.com/carloluisito/omnidesk/releases\n\nTo build from source: npm run package\n`
);
