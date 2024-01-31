#!/usr/bin/env node

import select, { Separator } from "@inquirer/select";
import input from "@inquirer/input";
import checkbox from "@inquirer/checkbox";
import { exec } from "child_process";
import axios from "axios";
import ora from "ora";
import ospath from "ospath";
import fs, { writeFile } from 'fs/promises';
import art from 'ascii-art';
import chalk from 'chalk';

var PKGS = [];
var MGR = null;
var LOCAL = true;

main();

async function intro(){
  await art.font("PkgPilot", 'doom', (err, rendered)=>{
    console.info(chalk.blue(rendered));
  });
  }

async function main() {
  await intro();
  process.nextTick(async()=>{
    let path = ospath.data();
  try {
    console.log("Attempting to read config file...");
      const configFile = await fs.readFile(`${path}/pkgsconfig.json`, 'utf8');
      const { mgr } = JSON.parse(configFile);
      if (mgr) {
          MGR = mgr;
          console.log("Config file found!");
          await crossRoads();
          return;
      } 
  } catch (err) {
      console.log("Config file not found or invalid.");
      await initializeMgr();
      return;
  }
});
}

async function initializeMgr() {
  try {
    MGR = await selectPackageManager();
    if (!MGR) return;

    await writeConfigFile();
    await crossRoads();
  } catch (err) {
    console.error("An error occurred:", err);
  }
}

async function selectPackageManager() {
  const mgr = await select({
    message: "Select a package manager to install dependencies:",
    choices: [
      {
        name: "npm",
        value: { type: "npm", init: "npm init -y", install: "npm install", globalInstall: "npm install -g" },
      },
      {
        name: "yarn",
        value: { type: "yarn", init: "yarn init -y", install: "yarn add", globalInstall: "yarn global add" },
      },
      {
        name: "pnpm",
        value: { type: "pnpm", init: "pnpm init", install: "pnpm install", globalInstall: "pnpm install -g" },
      },
      new Separator(),
      { name: "Quit", value: false },
    ],
  });
  return mgr;
}

async function writeConfigFile() {
  try {
    const dataPath = ospath.data();
    const configFilePath = `${dataPath}/pkgsconfig.json`;
    const config = { mgr: MGR };

    await writeFile(configFilePath, JSON.stringify(config));

    console.log("Config file written successfully.");
  } catch (err) {
    console.error("Failed to write config file:", err);
  }
}

async function crossRoads() {
  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Search node modules", value: "search" },
      { name: "Initialize project", value: "init" },
      { name: "Manage package list", value: "manage", disabled: !PKGS.length },
      { name: "Install packages", value: "install", disabled: !PKGS.length },
      new Separator(),
      { name: "Quit", value: false },
    ],
  });
  if (!action) return;
  if (action === "init") {
    await initialize();
  } else if (action === "search") {
    await search();
  } else if (action === "manage") {
    await manageList();
  } else if (action === "install") {
    await installPackages();
  } else {
    console.log("Goodbye!");
  }
}

async function initialize() {
  const spinner = ora(`Initializing ${MGR.type}...`).start();

  await exec(MGR.init, (err, stdout, stderr) => {
    if (err) {
      spinner.stop();
      console.log(err);
      crossRoads();
      return;
    }
    spinner.stop();
    crossRoads();
    return;
  });
}

async function search() {
  const searchInput = await input({ message: "Enter search terms" });
  const spinner = ora(`Searching for ${searchInput}...`).start();

  try {
    const response = await axios.get(`https://api.npms.io/v2/search?q=${searchInput}`);
    spinner.stop();

    const results = response.data.results;
    const packageChoices = results.map((pkg) => ({
      name: `${pkg.package.name} - ${pkg.package.description}`,
      value: pkg.package.name,
    }));

    const selectedPackages = await checkbox({
      message: "Select package(s) to view versions:",
      choices: packageChoices,
    });

    for (const pkg of selectedPackages) {
      // Fetch and select version here
      const versionSpinner = ora(`Fetching versions for ${pkg}...`).start();
      const versionResponse = await axios.get(`https://registry.npmjs.org/${pkg}`);
      versionSpinner.stop();

      const versions = Object.keys(versionResponse.data.versions);
      const selectedVersion = await select({
        message: `Select a version for ${pkg}:`,
        choices: versions.map(version => ({ name: version, value: version })),
      });

      PKGS.push({ name: pkg, version: selectedVersion });
    }

    const install = await select({
      message: "Install packages now?",
      choices: [
        { name: "Yes", value: true },
        { name: "No", value: false },
      ],
    });

    if (install) {
      await installPackages();
    } else {
      await crossRoads();
    }
  } catch (err) {
    spinner.stop();
    console.error("An error occurred during the search:", err.message);
    await crossRoads();
  }
}

async function installPackages() {
  LOCAL = await select({
    message: "Install packages globally or locally?",
    choices: [
      { name: "Global", value: false },
      { name: "Local", value: true },
      new Separator(),
      { name: "Cancel", value: null },
    ],
  });
  if (LOCAL === null) {
    await crossRoads();
    return;
  }
  const spinner = ora(`Installing packages...`).start();

  // Construct the package list string with versions
  const pkgList = PKGS.map(pkg => `${pkg.name}@${pkg.version}`).join(' ');

  const installCmd = LOCAL ? MGR.install : MGR.globalInstall;
  const command = `${installCmd} ${pkgList}`;

  try {
    await exec(command);
  } catch (err) {
    console.error('An error occurred during installation:', err);
  } finally {
    spinner.stop();
    PKGS = [];
    await crossRoads();
  }
}

async function manageList() {
  const selection = await checkbox({
    message: "Select package(s) to remove:",
    choices: PKGS.map(pkg => ({ name: `${pkg.name}@${pkg.version}`, value: pkg.name })),
  });

  const remove = await select({
    message: "Are you sure you want to remove these packages from your list?",
    choices: [
      { name: "Yes", value: true },
      { name: "No", value: false },
    ],
  });

  if (remove) {
    PKGS = PKGS.filter(pkg => !selection.includes(pkg.name));
    console.log("Updated package list: ", PKGS);
  }

  await crossRoads();
}
