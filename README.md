# Bar 3

Bar 3 is an automatic recruitment application created by bsnk-dev. It allows you to design and send a new message to every new player of the game Politics and War.
Download the latest release to use it. More information can be found [on this website](https://bar3.bsnk.dev).

# Running Source Files

If you want to run the source files, download the repo and run the following:

    npm i
  
    npm run build
  
    npm run start
  
To run these you will need node installed.

# Flags

View the generated flag help
    
    --help

Run the debugging logs

    --debug

Run without opening the browser

    --headless
    
Run on a different port than 8055

    --port [port]
    
Change the location of the files stored by Bar 3

    --workingdir [relative path]


# Active bot in this repo

`flame_bot/` (Python) is legacy and is not present in this repository snapshot.  
The active bot is `flame_bot_ts/` (TypeScript).

Use these repo-root commands for the entire project:

    npm i

    npm run build

    npm run start

`npm run build` builds both the root server and `flame_bot_ts`.  
`npm run start` starts both services.
`npm i` installs dependencies for both the root server and `flame_bot_ts`.

# Running both on Render (single service)

If you must run both components in one Render service, run both processes from one start command.

- Root Directory: *(leave empty)*
- Build Command:

    npm install && npm run build

- Start Command:

    npm run start

This starts `node flame_bot_ts/build/src/index.js` in the background (if built) and then starts the root TypeScript server in the foreground.

Why you saw `Could not open requirements file ... flame_bot/requirements.txt`:
- Some old instructions/scripts referenced the legacy Python bot path.
- In this repo snapshot, `flame_bot/` does not exist, so that pip command always fails.
- You do not need that Python requirements file to build or run the current TypeScript services.

Important: this is a process-co-location workaround. The recommended production setup is still two services.
