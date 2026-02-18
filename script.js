/* --------------------------------------------------------------
   Simple Bash‑like emulator for GitHub Pages (with dynamic prompt)
   -------------------------------------------------------------- */

(async () => {
    const outputEl = document.getElementById('output');
    const cmdInput = document.getElementById('cmd');
    const promptEl = document.getElementById('prompt');

    /* --------------------------------------------------------------
       ASCII art that will be shown when the user types `welcome`
       -------------------------------------------------------------- */
    let WELCOME_ART = '';
    let BOOKS_ART = '';

    /* ---------- NEW: renderPrompt ----------
       Shows: user@personal_device:<cwd>$   */
    function renderPrompt() {
        // Show root as "/" (no trailing slash)
        const cwdDisplay = state.cwd === '/' ? '/' : state.cwd;
        promptEl.innerHTML =
            `<span class="host">user@personal_device</span>` +
            `<span class="path">:${cwdDisplay}$</span> `;
    }

    /* ---------- Existing echo helpers ---------- */
    function echoHTML(html = '') {
        const line = document.createElement('div');
        line.innerHTML = html;
        outputEl.appendChild(line);
        outputEl.scrollTop = outputEl.scrollHeight;
    }

    function echo(text = '') {
        const line = document.createElement('div');
        line.textContent = text;
        line.classList.add('echo-line');
        outputEl.appendChild(line);
        outputEl.scrollTop = outputEl.scrollHeight;
    }

    /* ---------- Virtual file system ---------- */
    const fs = { '/': { type: 'dir', children: {} } };
    function getNode(path) {
        const parts = path.split('/').filter(Boolean);
        let cur = fs['/'];
        for (const name of parts) {
            if (!cur.children[name]) return null;
            cur = cur.children[name];
        }
        return cur;
    }

    /* ---------- State ---------- */
    const state = { cwd: '/' };   // start at root of /data/
    const commandHistory = [];   // stores every entered command string
    let historyIdx = -1;         // -1 means “not browsing history”

    /* ---------- Populate the FS (keep your own entries) ---------- */
    function populateFS() {
        const root = fs['/'].children;
        root['README.txt'] = { type: 'file', url: 'data/README.txt' };
        root['cv.txt'] = { type: 'file', url: 'data/cv/cv.txt' };
        root['books.txt'] = { type: 'file', url: 'data/books/bookshelf.txt' };
        root['me.png'] = { type: 'file', url: 'images/me.png' };
        // Projects folder
        root['projects'] = { type: 'dir', children: {} };
        const proj = root['projects'].children;

        proj['virus-screening.txt'] = {
            type: 'file',
            url: 'data/projects/virus.txt'
        };
        proj['mastermind.txt'] = {
            type: 'file',
            url: 'data/projects/mastermind.txt'
        };
        proj['network-inference.txt'] = {
            type: 'file',
            url: 'data/projects/network_inference.txt'
        };
    }

    /* ---------- Path resolution (unchanged) ---------- */
    function resolvePath(cwd, input) {
        if (!input) return cwd;
        if (input.startsWith('/')) { cwd = '/'; input = input.slice(1); }
        const parts = input.split('/');
        const stack = cwd === '/' ? [] : cwd.split('/').filter(Boolean);
        for (let p of parts) {
            if (p === '' || p === '.') continue;
            if (p === '..') stack.pop();
            else stack.push(p);
        }
        return '/' + stack.join('/');
    }

    /* ---------- Command implementations (only ls changed earlier) ---------- */
    async function cmd_cd(args) {
        const target = args[0] || '/';
        const newPath = resolvePath(state.cwd, target);
        const node = getNode(newPath);
        if (!node) { echo(`cd: no such file or directory: ${target}`); return; }
        if (node.type !== 'dir') { echo(`cd: not a directory: ${target}`); return; }
        state.cwd = newPath;
        renderPrompt();                 // update prompt after cd
    }

    function cmd_pwd() { echo(state.cwd); }

    function cmd_ls() {
        const node = getNode(state.cwd);
        if (!node || node.type !== 'dir') { echo('ls: cannot access: Not a directory'); return; }
        const entries = Object.keys(node.children).sort();
        const html = entries.map(name => {
            const child = node.children[name];
            return child.type === 'dir'
                ? `<span class="folder">${name}</span>`
                : name;
        }).join('  ');
        echoHTML(html);
    }

    async function cmd_cat(args) {
        if (!args.length) { echo('cat: missing operand'); return; }
        const filePath = resolvePath(state.cwd, args[0]);
        const node = getNode(filePath);
        if (!node) { echo(`cat: ${args[0]}: No such file or directory`); return; }
        if (node.type !== 'file') { echo(`cat: ${args[0]}: Is a directory`); return; }
        try {
            const resp = await fetch(node.url);
            if (!resp.ok) throw new Error('Network error');
            const txt = await resp.text();
            echoHTML(txt);
        } catch (_) { echo(`cat: failed to read ${args[0]}`); }
    }

    function cmd_clear() { outputEl.innerHTML = ''; }
    function cmd_exit() { location.reload(); }

    function cmd_welcome() {
        // Wrap in <pre> so whitespace is honoured
        echoHTML('<pre>' + WELCOME_ART + '</pre>');
    }

    function cmd_books() {
        // Wrap in <pre> so whitespace is honoured
        echoHTML('<pre>' + BOOKS_ART + '</pre>');
    }

    /* --------------------------------------------------------------
    ABOUT command – fetches about.md, renders it with Marked,
    and prints the resulting HTML into the terminal output.
    -------------------------------------------------------------- */
    async function cmd_about() {
        try {
            const resp = await fetch('about.md');
            if (!resp.ok) throw new Error('Network error');
            const markdown = await resp.text();

            // Convert Markdown → HTML (marked is loaded from the CDN)
            const html = marked.parse(markdown);

            // Wrap in a container so our CSS can target it
            echoHTML(`<div class="markdown-body">${html}</div>`);
        } catch (e) {
            console.error(e);
            echo('Unable to load the about page.');
        }
    }


    /* --------------------------------------------------------------
    DISPLAY command – shows an image file inside the terminal output
    -------------------------------------------------------------- */
    async function cmd_display(args) {
        if (!args.length) {
            echo('display: missing filename (e.g. display image.png)');
            return;
        }

        const fileName = args[0];               // e.g. "image.png"
        const filePath = resolvePath(state.cwd, fileName);
        const node = getNode(filePath);

        // ------------------------------------------------------------------
        // 1️⃣ If the file exists in the virtual FS, use its URL.
        // 2️⃣ Otherwise fall back to a direct relative URL (works for a plain
        //    image placed next to index.html).
        // ------------------------------------------------------------------
        let imgUrl = null;
        if (node && node.type === 'file') {
            imgUrl = node.url;                  // URL we already store for .txt files
        } else {
            // Assume the image lives next to index.html (or in a sub‑folder you
            // reference, e.g. "assets/image.png").
            imgUrl = fileName;
        }

        // Try to load the image – we just create an <img> tag; the browser will
        // report an error if the file is missing.
        const testImg = new Image();
        testImg.onload = () => {
            // Image loaded successfully – render it.
            const html = `<div class="display-image"><img src="${imgUrl}" alt="${fileName}"></div>`;
            echoHTML(html);
        };
        testImg.onerror = () => {
            echo(`display: could not load "${fileName}". Make sure the file exists and the path is correct.`);
        };
        testImg.src = imgUrl;   // trigger loading
    }

    const commands = {
        cd: cmd_cd,
        pwd: cmd_pwd,
        ls: cmd_ls,
        cat: cmd_cat,
        clear: cmd_clear,
        exit: cmd_exit,
        help: () => echo('Supported commands: cd, cd .., pwd, ls, cat <file>, clear, exit, welcome, books, about, display'),
        welcome: cmd_welcome,
        books: cmd_books,
        about: cmd_about,
        display: cmd_display          // <-- NEW command
    };


    /* ---------- Run a command ---------- */
    async function runCommand(line) {
        if (!line.trim()) return;
        echo(`$ ${line}`);               // echo the raw line the user typed
        const [rawCmd, ...rawArgs] = line.trim().split(/\s+/);
        const cmd = rawCmd.toLowerCase();
        const handler = commands[cmd];
        if (!handler) { echo(`${cmd}: command not found`); return; }
        try { await handler(rawArgs); } catch (e) { console.error(e); echo(`Error executing ${cmd}`); }
    }

    async function loadWelcomeArt() {
        try {
            const resp = await fetch('data/art/welcome.txt');   // path relative to the page
            if (!resp.ok) throw new Error('Network error');
            // Preserve line‑breaks exactly as they appear in the file
            WELCOME_ART = await resp.text();
        } catch (e) {
            console.error('Failed to load welcome art:', e);
            // Fallback – a short placeholder so the command still works
            WELCOME_ART = '[welcome art could not be loaded]';
        }
    }

    async function loadBooksArt() {
        try {
            const resp = await fetch('data/books/bookshelf.txt');   // path relative to the page
            if (!resp.ok) throw new Error('Network error');
            // Preserve line‑breaks exactly as they appear in the file
            BOOKS_ART = await resp.text();
        } catch (e) {
            console.error('Failed to load books art:', e);
            // Fallback – a short placeholder so the command still works
            BOOKS_ART = '[books art could not be loaded]';
        }
    }

    /* ---------- Event listener ---------- */
    cmdInput.addEventListener('keydown', async (e) => {
        // ------------------------------------------------------------------
        // 1️⃣ Handle TAB for auto‑completion
        // ------------------------------------------------------------------
        if (e.key === 'Tab') {
            e.preventDefault();               // stop the browser from moving focus

            const raw = cmdInput.value;       // what the user has typed so far
            const parts = raw.split(/\s+/);   // split on whitespace
            const lastPart = parts[parts.length - 1]; // the token we want to complete

            // Resolve the directory we are completing *inside*.
            // If the token contains a slash, treat everything before the last slash
            // as a sub‑path, otherwise use the current working directory.
            let basePath = state.cwd;
            let prefix = '';                  // part before the token we keep
            if (lastPart.includes('/')) {
                const idx = lastPart.lastIndexOf('/');
                prefix = lastPart.slice(0, idx + 1);           // keep the leading path
                const sub = lastPart.slice(0, idx);            // path before the slash
                basePath = resolvePath(state.cwd, sub);
            }

            const node = getNode(basePath);
            if (!node || node.type !== 'dir') {
                // nothing to complete – just bail out
                return;
            }

            // Gather all possible completions (files + folders) that start with the
            // characters after the last slash (or the whole token if no slash).
            const needle = lastPart.slice(prefix.length).toLowerCase();
            const candidates = Object.keys(node.children)
                .filter(name => name.toLowerCase().startsWith(needle))
                .map(name => ({
                    name,
                    type: node.children[name].type
                }));

            if (candidates.length === 0) {
                // No match – do nothing (you could flash a warning if you like)
                return;
            }

            if (candidates.length === 1) {
                // ------- SINGLE MATCH: auto‑fill -------
                const match = candidates[0];
                // If it’s a directory we add a trailing slash so the user can keep typing.
                const suffix = match.type === 'dir' ? '/' : '';
                const completed = prefix + match.name + suffix + ' ';
                // Re‑assemble the command line: everything before the token + completed token
                const newValue = parts.slice(0, -1).join(' ') + (parts.length > 1 ? ' ' : '') + completed;
                cmdInput.value = newValue;
            } else {
                // ------- MULTIPLE MATCHES: show hint list -------
                const hint = candidates
                    .map(c => c.type === 'dir' ? `${c.name}/` : c.name)
                    .join('   ');
                // Print the hint below the prompt (styled with .completion-hint)
                echoHTML(`<div class="completion-hint">${hint}</div>`);
            }
            return; // we handled Tab – stop further processing
        }

        if (e.key === 'Enter') {
            const line = cmdInput.value;
            cmdInput.value = '';

            if (line.trim()) {
                commandHistory.push(line.trim());
                historyIdx = commandHistory.length;   // point just past the newest entry
            }

            await runCommand(line);
        } else if (e.key === 'ArrowUp') {
            // Move back in history (older command)
            if (commandHistory.length === 0) return;   // nothing to show
            if (historyIdx > 0) historyIdx--;
            cmdInput.value = commandHistory[historyIdx] || '';
            // Prevent the cursor from moving to the start of the line
            e.preventDefault();
        }
        else if (e.key === 'ArrowDown') {
            // Move forward in history (newer command)
            if (commandHistory.length === 0) return;
            if (historyIdx < commandHistory.length) historyIdx++;
            // When we go *past* the newest entry we show an empty line
            cmdInput.value = (historyIdx < commandHistory.length)
                ? commandHistory[historyIdx] || ''
                : '';
            e.preventDefault();
        }
    });

    document.addEventListener('click', (e) => {
        // If the click originated inside a link, ignore it.
        const isLink = e.target.closest('a');
        // If the click is already on the input, ignore (it’s already focused).
        const isInput = e.target === cmdInput;
        if (!isLink && !isInput) {
            cmdInput.focus();
        }
    });

    /* ---------- Initialise ---------- */
    populateFS();
    await loadWelcomeArt();
    await loadBooksArt();
    renderPrompt();                     // draw the initial prompt
    echo('Welcome! Type "help" for a list of commands.');
    cmdInput.focus();
})();