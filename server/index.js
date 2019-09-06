const express = require("express");
const app = express();
const fs = require("fs");
const inquirer = require("inquirer");
const axios = require("axios");
const path = require("path");
const beautify = require("js-beautify").js;
const esprima = require("esprima");

app.engine("ejs", require("ejs").renderFile);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/assets", express.static(path.join(__dirname, "../assets")));

const loadFrom = async () => {
  const locationQuestion = [
    {
      type: "list",
      name: "choice",
      message: "What do you want to do?",
      choices: ["Load from file", "Load from URL"],
      filter: val => val.toLowerCase()
    }
  ];

  const location = await inquirer.prompt(locationQuestion);
  if (location.choice === "load from file") {
    const files = fs.readdirSync(path.join(__dirname, "../assets"));
    const fileQuestion = [
      {
        type: "list",
        name: "choice",
        message: "Which pooky version would you like to use?",
        choices: files,
        filter: val => val.toLowerCase()
      }
    ];
    const useFile = await inquirer.prompt(fileQuestion);
    return { type: "file", location: useFile.choice };
  } else {
    const pookyQuestion = [
      {
        type: "input",
        name: "url",
        message: "Enter the Pooky URL"
      }
    ];
    const pooky = await inquirer.prompt(pookyQuestion);

    const tohruQuestion = [
      {
        type: "input",
        name: "value",
        message: "Enter the Pooky Tohru"
      }
    ];
    const tohru = await inquirer.prompt(tohruQuestion);

    return { type: "url", location: pooky.url, tohru: tohru.value };
  }
};

const isDateCheck = node => {
  return (
    node.type === "ExpressionStatement" &&
    node.expression.type === "AssignmentExpression" &&
    node.expression.left &&
    node.expression.left.type === "Identifier" &&
    node.expression.right &&
    node.expression.right.type === "ConditionalExpression" &&
    node.expression.right.test &&
    node.expression.right.test.left &&
    node.expression.right.test.left.callee &&
    node.expression.right.test.left.callee.object &&
    node.expression.right.test.left.callee.object.name === "Math"
  );
};

const fetchPookyFromURL = async url => {
  const res = await axios.get(url);
  let formattedPooky = beautify(res.data, {
    indent_size: 2,
    space_in_empty_paren: true,
    unescape_strings: true
  });
  let finalFormattedPooky = formattedPooky;
  esprima.parseScript(formattedPooky, { range: true }, function(node, meta) {
    if (isDateCheck(node)) {
      const identifier = node.expression.left.name;
      const line = formattedPooky.substring(meta.start.offset, meta.end.offset);

      let path = line.substring(line.indexOf("?") + 1, line.indexOf(":") - 1);
      finalFormattedPooky = finalFormattedPooky.replace(
        line,
        `${identifier} = ${path};`
      );
      console.log("Found Date Check with identifier: " + identifier);
      console.log("Path: " + path);
    }
  });

  return finalFormattedPooky;
};

const saveConfig = () => {
  fs.writeFile(
    path.join(__dirname, "../config.json"),
    JSON.stringify(global.config, null, 2),
    err => {
      if (err) throw err;
    }
  );
};

loadFrom()
  .then(res => {
    let { type, location, tohru } = res;
    const pookyFileName = `${location.substr(location.indexOf("pooky.min."))}`;

    if (type === "url") {
      fetchPookyFromURL(location).then(pooky => {
        const dir = path.join(__dirname, "../assets");
        const fileName = path.join(dir, pookyFileName);

        // If assets dir doesn't exist we create one.
        !fs.existsSync(dir) && fs.mkdirSync(dir);

        let found = false;

        // Loop through our pookys to check if it already exists
        for (let pooky of global.config.pookys) {
          if (pooky.fileName == pookyFileName) {
            found = true;
          }
        }

        // If pooky is not already added to our config.
        if (!found) {
          // Save our pooky to file.
          fs.writeFile(fileName, pooky, err => {
            if (err) throw err;
          });

          // Push our newly saved pooky/tohru to our current config.
          global.config.pookys.push({
            fileName: pookyFileName,
            tohru
          });

          // Save our config to file.
          saveConfig(global.config);
        }
      });
    } else {
      // Loop through our pookys and find our tohru.
      for (let pooky of global.config.pookys) {
        if (pooky.fileName == pookyFileName) {
          tohru = pooky.tohru;
        }
      }
    }

    location = `http://supremenewyork.com/assets/${pookyFileName}`;

    // Our route
    app.get("/", function(req, res) {
      res.render("index", {
        pooky: location,
        tohru: tohru
      });
    });
  })
  .catch(err => {
    console.log(`An error occured: ${err}`);
  });

module.exports = app;
