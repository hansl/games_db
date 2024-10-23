import JSON5 from "json5";
import {promises as fs} from "fs";
import args, {OptionDefinition} from "command-line-args";
import {Game, GamesDb} from "./schemas/games_db";
import {closest, distance} from "fastest-levenshtein";

interface Aliases {
    [key: string]: string;
}

const ARGUMENTS: OptionDefinition[] = [
    {
        name: "positionals",
        type: String,
        multiple: true,
        defaultOption: true,
    },
    {
        name: "aliases",
        type: String,
    },
    {
        name: "levenshtein",
        type: Boolean,
        alias: "l",
    }
];

async function minify() {
    const options = args(ARGUMENTS);
    const [input, output] = options.positionals;
    if (input === undefined) {
        throw new Error("Input file not provided.");
    }
    if (output === undefined) {
        throw new Error("Output file not provided.");
    }

    const inputJson = JSON.parse(await fs.readFile(input, "utf-8")) as GamesDb;
    const aliases = options.aliases ? JSON5.parse(await fs.readFile(options.aliases, "utf-8")) as Aliases : {};

    // Remove duplicates names.
    const seen = new Map<string, Game>();
    const games = inputJson.games.filter(game => {
        if (aliases[game.name]) {
            game.name = aliases[game.name];
        }

        let maybeExisting = seen.get(game.name);
        if (maybeExisting) {
            maybeExisting.sources.push(...game.sources);
            return false;
        } else {
            seen.set(game.name, game);
            return true;
        }
    });

    if (options.levenshtein) {
        // Calculate the levenshtein distance between each game name. Show the smallest
        // distances.
        console.log("Calculating Levenshtein distances...");
        const levenshtein = new Map<string, string>();
        for (let i = 0; i < games.length - 2; i++) {
            const a = games[i].name;
            const c = closest(a, games.slice(i + 1).map(game => game.name));
            levenshtein.set(`${a}`, `${c}`);
            if (i % 1000 == 0) {
                console.log(`Progress: ${i}/${games.length}`);
            }
        }

        const distances: [string, string, number][] = [];
        for (const [a, b] of levenshtein) {
            const d = distance(a, b);
            if (d < 5) {
                distances.push([a, b, d]);
            }
        }
        distances.sort((a, b) => a[2] - b[2]);
        console.log("Levenshtein distances (in sorted order):");
        for (const [a, b, d] of distances) {
            console.log(`${a} -> ${b} = ${d}`);
        }
    }

    await fs.writeFile(output, JSON.stringify({games}, undefined, 2));
}


minify().then(() => {
    process.exit(0);
}, (e) => {
    console.error("An error occurred:");
    console.error(e);
    process.exit(1);
});
