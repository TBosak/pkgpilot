#!/usr/bin/env node

import select, { Separator } from "@inquirer/select";
import input from "@inquirer/input";
import checkbox from "@inquirer/checkbox";
import { exec } from "child_process";
import axios from "axios";
import ora from "ora";
import chalk from 'chalk';
// import ospath from "ospath";
// import fs from "fs";

var PKGS = [];
var MGR = null;
var LOCAL = true;

main();

async function main() {
  //   let path = ospath.data();
  //read config file
  //   console.log("Attempting to read config file...");
  //   const config = await import(`//${path}/pkgsconfig.json`, {
  //     assert: {
  //       type: "json",
  //     },
  //     }).catch((err) => {
  //       console.log("Config file not found!");
  //   });
  //   if (config?.mgr) {
  //     MGR = config.mgr;
  //     console.log("Config file found!");
  //     await crossRoads();
  //   } else {
  // console.log("Config file not found!");
  await initializeMgr();
  //   }
}

async function initializeMgr() {
  const mgr = await select({
    message: "Select a package manager to install dependencies:",
    choices: [
      {
        name: "npm",
        value: { type: "npm", init: "npm init -y", install: "npm install" },
      },
      {
        name: "yarn",
        value: { type: "npm", init: "yarn init -y", install: "yarn add" },
      },
      {
        name: "pnpm",
        value: { type: "pnpm", init: "pnpm init", install: "pnpm install" },
      },
      new Separator(),
      { name: "Quit", value: false },
    ],
  });
  MGR = mgr;
  //   let path = ospath.data();
  //   //write config file with mgr
  //   console.log("Writing config file...");
  //   var config = { mgr: MGR };
  //   fs.writeFile(
  //     `${path}/pkgsconfig.json`,
  //     JSON.stringify(config),
  //     function (err) {
  //       if (err) throw err;
  //       console.log("Config file created!");
  //     }
  //   );
  if (!mgr) return;
  await crossRoads();
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
  console.log(`Initializing ${MGR.type}...`);

  await exec(MGR.init, (err, stdout, stderr) => {
    if (err) {
      console.log(err);
      crossRoads();
    }
    console.log(stdout);
    crossRoads();
  });
}

async function search() {
  const searchInput = await input({ message: "Enter search terms" });
  const spinner = ora(`Searching for ${searchInput}...`).start();
  const response = await axios
    .get(`https://api.npms.io/v2/search?q=${searchInput}`)
    .then((res) => {
      spinner.stop();
      return res;
    });
  const results = response.data.results;
  const choices = results.map((pkg) => {
    return { name: pkg.package.name, value: pkg.package.name };
  });
  const selection = await checkbox({
    message: "Select package(s) to install:",
    choices: choices,
  });
  PKGS.push(...selection);
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
  }
  const spinner = ora(`Installing packages...`).start();
  const pkgList = PKGS.join(" ");
  const installCmd = `${MGR.install} ${pkgList} ${LOCAL ? "" : "-g"}`;
  await exec(installCmd, (err, stdout, stderr) => {
    if (err) {
      console.log(err);
      crossRoads();
    }
    spinner.stop();
    console.log(stdout);
    PKGS = [];
    crossRoads();
  });
}

async function manageList() {
  const choices = PKGS.map((pkg) => {
    return { name: pkg, value: pkg };
  });
  const selection = await checkbox({
    message: "Select package(s) to remove:",
    choices: choices,
  });
  const remove = await select({
    message: "Are you sure you want to remove these packages from your list?",
    choices: [
      { name: "Yes", value: true },
      { name: "No", value: false },
    ],
  });
  if (remove) {
    PKGS = PKGS.filter((pkg) => {
      return !selection.includes(pkg);
    });
    console.log("Updated package list: ", PKGS);
    await crossRoads();
  } else {
    await crossRoads();
  }
}
