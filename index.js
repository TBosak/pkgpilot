#!/usr/bin/env node

import select, { Separator } from "@inquirer/select";
import input from "@inquirer/input";
import checkbox from "@inquirer/checkbox";
import { exec } from "child_process";
import axios from "axios";
import ora from "ora";
import ospath from "ospath";
import fs from "fs";

var PKGS = [];
var MGR = null;
var LOCAL = true;

main();

async function main() {
    let path = ospath.data();
    console.log("Attempting to read config file...");
    try{
        const {default: mgr} = await import(`file://${path}/pkgsconfig.json`, {
            assert: {
              type: "json",
            },
            }).catch((err) => {
              console.log(err);
          });
          if (mgr) {
            MGR = mgr;
            console.log("Config file found!");
            await crossRoads();
            return;
          } else {
        console.log("Config file not found!");
        await initializeMgr();
        return;
          }
    } catch (err) {
        console.log("Config file not found!");
        await initializeMgr();
        return;
    }
}

async function initializeMgr() {
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
  MGR = mgr;
  try{
    let path = ospath.data();
    //write config file with mgr
    console.log("Writing config file...");
    var config = { mgr: MGR };
    fs.writeFile(
      `${path}/pkgsconfig.json`,
      JSON.stringify(config),
      function (err) {
        if (err) throw err;
      }
    );
  } catch (err) {
    console.log("Config file not written!");
  }
  if (!mgr) return;
  await crossRoads();
  return;
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
      return;
    }
    console.log(stdout);
    crossRoads();
    return;
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
    return { name: `${pkg.package.name} - ${pkg.package.description} `, value: pkg.package.name };
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
    return;
  } else {
    await crossRoads();
    return;
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
  const pkgList = PKGS.join(" ");
  const installCmd = LOCAL ? MGR.install : MGR.globalInstall;
  const command = `${installCmd} ${pkgList}`;
  await exec(command, (err, stdout, stderr) => {
    if (err) {
      console.log(err);
      crossRoads();
      return;
    }
    spinner.stop();
    console.log(stdout);
    PKGS = [];
    crossRoads();
    return;
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
    return;
  } else {
    await crossRoads();
    return;
  }
}
