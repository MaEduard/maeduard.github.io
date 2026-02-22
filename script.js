/* --------------------------------------------------------------
   Simple Bash‑like emulator for GitHub Pages (with dynamic prompt)
   -------------------------------------------------------------- */

(async () => {
    const outputEl = document.getElementById('output');
    const cmdInput = document.getElementById('cmd');
    const promptEl = document.getElementById('prompt');

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
        // root['README'] = { type: 'file-txt', url: 'data/art/welcome.txt' };
        root['cv.txt'] = { type: 'file-txt', url: 'data/cv/cv.txt' };
        root['books.txt'] = { type: 'file-txt', url: 'data/books/bookshelf.txt' };
        root['me.png'] = { type: 'file-img', url: 'images/me.png' };
        // Projects folder
        root['projects'] = { type: 'dir', children: {} };
        const proj = root['projects'].children;

        proj['virus-screening.txt'] = {
            type: 'file-txt',
            url: 'data/projects/virus.txt'
        };
        proj['mastermind.txt'] = {
            type: 'file-txt',
            url: 'data/projects/mastermind.txt'
        };
        proj['network-inference.txt'] = {
            type: 'file-txt',
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
        cmd_ls();
    }

    function cmd_pwd() { echo(state.cwd); }

    function cmd_ls() {
        const node = getNode(state.cwd);
        if (!node || node.type !== 'dir') {
            echo('ls: cannot access: Not a directory');
            return;
        }

        // Gather and sort real entries from the virtual FS
        const entries = Object.keys(node.children).sort();

        // Build the HTML list. If not at root, add a synthetic ".." first.
        const parts = [];

        // Add clickable ".." to go up one directory (only if not at root)
        if (state.cwd !== '/') {
            parts.push(
                `<span class="clickable up-item" data-action="cd ..">..</span>`
            );
        }

        // Then render real entries
        for (const name of entries) {
            const child = node.children[name];

            if (child.type === 'dir') {
                // Click → cd <dir>
                parts.push(
                    `<span class="clickable folder" data-action="cd ${name}">${name}/</span>`
                );
            } else if (child.type === 'file-txt') {
                // Click → cat <file>
                parts.push(
                    `<span class="clickable" data-action="cat ${name}">${name}</span>`
                );
            } else if (child.type === 'file-img') {
                // Click → display <image>
                parts.push(
                    `<span class="clickable" data-action="display ${name}">${name}</span>`
                );
            } else {
                // Fallback: plain name (non-clickable)
                parts.push(name);
            }
        }

        // Print the row (space-separated) to your output
        echoHTML(parts.join(' '));
    }

    async function cmd_cat(args) {
        if (!args.length) { echo('cat: missing operand'); return; }
        const filePath = resolvePath(state.cwd, args[0]);
        const node = getNode(filePath);
        if (!node) { echo(`cat: ${args[0]}: No such file or directory`); return; }
        if (node.type !== 'file-txt') { echo(`cat: ${args[0]}: Is not a text file`); return; }
        else {
            try {
                const resp = await fetch(node.url);
                if (!resp.ok) throw new Error('Network error');
                const txt = await resp.text();

                // Center by default, left-align if the file is under /projects
                const wrapperClass = 'txt-file txt-left';
                echoHTML(`<div class="${wrapperClass}">${txt}</div>`);

            } catch (_) { echo(`cat: failed to read ${args[0]}`); }
        }
    }

    function cmd_clear() { outputEl.innerHTML = ''; }
    function cmd_exit() { location.reload(); }


    /* --------------------------------------------------------------
    DISPLAY command – shows an image file inside the terminal output
    -------------------------------------------------------------- */
    async function cmd_display(args) {
        if (!args.length) {
            echo('display: missing filename');
            return;
        }

        const fileName = args[0];               // e.g. "image.png"
        const filePath = resolvePath(state.cwd, fileName);
        const node = getNode(filePath);

        // ------------------------------------------------------------------
        // 1️ If the file exists in the virtual FS, use its URL.
        // 2️ Otherwise fall back to a direct relative URL (works for a plain
        //    image placed next to index.html).
        // ------------------------------------------------------------------
        let imgUrl = null;
        if (node && node.type === 'file-img') {
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
        help: () => echo('Supported commands: cd, cd .., pwd, ls, cat <file>, clear, exit, books, display'),
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

    // Handle clickable LS items
    outputEl.addEventListener('click', async (e) => {
        const target = e.target.closest(".clickable");
        if (!target) return;

        const action = target.dataset.action;
        if (!action) return;

        // Echo it as if typed
        echo(`$ ${action}`);

        // Split & execute
        const [cmd, ...args] = action.split(/\s+/);
        const handler = commands[cmd];

        if (handler) {
            await handler(args);
        }
    });

    // Event listener to focus the input when clicking anywhere (except on links or the input itself)
    // document.addEventListener('click', (e) => {
    //     // If the click originated inside a link, ignore it.
    //     const isLink = e.target.closest('a');
    //     // If the click is already on the input, ignore (it’s already focused).
    //     const isInput = e.target === cmdInput;
    //     if (!isLink && !isInput) {
    //         cmdInput.focus();
    //     }
    // });

    /* ---------- Initialise ---------- */
    populateFS();
    renderPrompt();                     // draw the initial prompt
    echo('Welcome! Type "help" for a list of commands.');
    await runCommand("ls");
    cmdInput.focus();
})();