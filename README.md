# Silicon Path

![Silicon Path Technical Manual](static/images/technical-manual-cover.jpg)

A C course and a computer-systems course that run on your own laptop. No account, no API key, no wifi once it's installed.

## Why this exists

Realising quickly the pain point for most of the class attending was that the teacher would just dump the material on you by reading and that's it. Statistically, majority of cybersecurity students are neurodivergent and that is one of the least useful ways of teaching.

As an older student who suffers from AuDHD, I faced "task paralysis" when I was younger. Now, as an older student, I want to reduce the barrier of learning by creating this project that runs on localhost. No API keys, no slow WIFI, nothing. Just uninterrupted learning.

This project applies psychological principles to maximise learning and retention (active recall, forcing predictions, bite-sized chunks) while providing a beautiful, warm, calming UI to keep you grounded and prevent cognitive overload.

## What's in it

Three tracks. The switch at the top of the left rail (CST, CH, WS) moves between them.

The CST1500 course is 23 modules and 67 short lessons that follow the lecture deck: data, number systems, architecture, logic, memory, I/O, operating systems, processes, scheduling, deadlocks, virtual memory, security, networks, cloud. Module 23 is an extra one on the Bash shell. Most lessons end with a quiz question, and each has a "plain English" block whose analogy you can flip between football and money.

The C Handbook is 20 chapters on the language itself, from variables to the preprocessor. Every chapter has a "Predict before you run" step and three exercises that you write and run yourself.

The Lab Worksheets are the five CST1500 lab sheets rebuilt as pages, 63 exercises in all. Each week has live diagrams (a number-base converter, a logic gate simulator, a waveform and so on). Code exercises are checked against the expected output. Theory exercises you mark as read, and that is counted separately from verified code.

There are also four 3D visualisers you can orbit and poke: the CPU, the memory hierarchy, the process scheduler and paging. Some are embedded inside lessons too.

The C compiler is real Clang running as WebAssembly in your browser. It powers the exercises and the free playground. The toolchain files are inside the repo, so pressing Run downloads nothing. Cmd+K (Ctrl+K on Windows) opens a command palette.

## How it tries to help you learn

You're asked to guess before you're shown. The prediction boxes have to be filled in before the model answer appears. Quizzes shuffle their options and let you answer again later, because getting it right once isn't the same as knowing it. Worksheets only count code that passed its check. Lessons are short, one idea each, and the page is quiet on purpose.

## Setup

You need an internet connection once, for `pnpm install`. After that it all runs offline.

You need Node 22.12 or newer (24 is fine) and pnpm 10 or newer. The folder is about 110 MB as sent and around 900 MB after installing, so keep a few GB free.

### Mac

1. Install Node from [nodejs.org](https://nodejs.org). The LTS installer is fine. Homebrew works too: `brew install node`.
2. Open Terminal and check it worked:
   ```bash
   node --version
   ```
   It should say v22 or higher.
3. Install pnpm:
   ```bash
   npm install -g pnpm
   ```
4. Go into the project folder and install:
   ```bash
   cd path/to/LearnC
   pnpm install
   ```
5. Start it:
   ```bash
   pnpm dev
   ```
6. Open http://localhost:5173 in your browser.

### Windows

1. Install Node from [nodejs.org](https://nodejs.org). Take the LTS installer and leave the defaults on.
2. Close and reopen PowerShell (or Windows Terminal) so it sees the new install, then check:
   ```powershell
   node --version
   ```
   It should say v22 or higher.
3. Install pnpm:
   ```powershell
   npm install -g pnpm
   ```
4. Go into the project folder and install:
   ```powershell
   cd path\to\LearnC
   pnpm install
   ```
5. Start it:
   ```powershell
   pnpm dev
   ```
6. Open http://localhost:5173 in your browser.

To stop it, press Ctrl+C in the terminal. Next time you only need `pnpm dev`.

I'd use Chrome or Edge. That's what the project is built and checked against.

## Troubleshooting

Port 5173 is already in use. The server is set to fail rather than quietly pick another port. Either you've already got a copy running, or something else has the port. Close the other terminal, or find what's holding it.

On Mac:
```bash
lsof -i :5173
kill <PID>
```

On Windows:
```powershell
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

Or run it somewhere else with `pnpm dev --port 5180`. Your progress is saved per address, so another port looks like a fresh start. Go back to 5173 and it's all still there.

`pnpm` is not recognised. Close and reopen the terminal after installing. If it still isn't found, run `npm install -g pnpm` again.

On Windows, PowerShell says running scripts is disabled. Run this once, then try again:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Install complains about your Node version. Run `node --version`. Anything below 22.12 is too old, so grab a newer one from nodejs.org.

The first Run takes several seconds. That's normal. The compiler boots once, which takes roughly 4 to 7 seconds, and later runs take about a second. A program that waits for input (`scanf`) makes the next run boot it again.

A program that reads input gets nothing, or the compiler doesn't start at all. This is almost always the web server, not the code: if you serve `build/` yourself — `python -m http.server build`, `npx serve build`, or opening `build/index.html` straight from disk — the browser withholds `SharedArrayBuffer`, because those servers don't send the two headers cross-origin isolation requires, and the compiler's input channel is built on it.

Use `pnpm preview`: it serves the same `build/` directory on http://localhost:4173 with the headers attached. To host the build anywhere else, that server has to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every response. `static/_headers` already contains them, along with the Content-Security-Policy and the rest of the security headers, in Netlify and Cloudflare Pages format, so those two hosts apply everything automatically. Everything else in `build/` is plain static files.

Progress vanished. It lives in your browser's local storage for that address. Clearing site data, using a private window, or switching browser or port starts you from zero.

The 3D scenes are slow. They're the heaviest part. Close other heavy tabs and check that hardware acceleration is on in your browser.

## Other commands

```
pnpm build      build the static site into build/ (also refreshes the CSP hashes)
pnpm preview    serve that build on http://localhost:4173
pnpm check      type checks
pnpm test       unit tests
```

## For the curious

It's built with SvelteKit, Svelte 5, TypeScript, Tailwind, and CodeMirror 6. Lessons are written in MDX and live in `src/content`. The worksheet exercises are typed data in `src/lib/content/worksheets`. The warm "editorial" design system is documented in `DESIGN.md`.

The C compiler uses Emception, which compiles real Clang to WebAssembly so it can run entirely in the browser without a backend. 

This is a personal project I built to help my classmates pass. It's not published or monetised.