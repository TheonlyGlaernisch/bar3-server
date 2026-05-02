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


# Python Bot (flame_bot)

To run the Python Discord bot in `flame_bot/` (there is no separate build step):

    cd flame_bot

    pip install -r requirements.txt

    cp .env.example .env

    python bot.py

To run bot tests:

    cd flame_bot

    pytest tests/ -v

# Run both services together

Use two terminals from the repo root.

Terminal 1 (TypeScript server):

    npm i

    npm run build

    npm run start

Terminal 2 (Python bot):

    cd flame_bot

    pip install -r requirements.txt

    cp .env.example .env

    python bot.py

# Running both on Render (single service)

If you must run both components in one Render service, run both processes from one start command.

- Root Directory: *(leave empty)*
- Build Command:

    npm install && npm run build && pip install -r flame_bot/requirements.txt

- Start Command:

    ./scripts/run-both.sh

This starts `python flame_bot/bot.py` in the background and then starts the TypeScript server in the foreground (`npm run start`).

Important: this is a process-co-location workaround. The recommended production setup is still two services.

