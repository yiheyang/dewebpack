#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const esprima = require('esprima');
const escodegen = require('escodegen');

let jsFileList = [];
let readFold = (foldPath) => {
    let files = fs.readdirSync(foldPath);
    files.forEach((fileName) => {
        let pathName = path.join(foldPath, fileName);
        let stats = fs.statSync(pathName);
        if (stats.isDirectory()) {
            readFold(pathName);
        }
        if (stats.isFile() && fileName.match(/^.+\.js$/)) {
            jsFileList.push(pathName);
        }
    });
};

let mapNode = (node) => {
    if (typeof node !== "object" || !node) return;
    let keys = Object.keys(node);
    keys.map((key) => {
        if (typeof node[key] === "object") {
            mapNode(node[key]);
        }
    });
    if (node.type === "Program" || node.type === "BlockStatement") {
        parseBody(node.body, node);
    }
};
let parseBody = (body, parent) => {
    if (parent.bodyParsed) return;
    let bodyInserted;
    let removeComma = (node, key, body) => {
        if (node.type === "ExpressionStatement") {
            if (node.expression.type === "SequenceExpression") {
                while (node.expression.expressions.length > 1) {
                    let new_node = {
                        'type': 'ExpressionStatement',
                        'expression': node.expression.expressions.pop()
                    };
                    body.splice(key + 1, 0, new_node);
                    bodyInserted++;
                }
                node.expression = node.expression.expressions[0];
            }
        }
    };
    let isExpression = (node) => {
        return node.type.match(/^.+Expression$/) || ['Literal', 'Identifier'].indexOf(node.type) > -1
    };
    let deepLogicalReplace = (node) => {
        if (node.type === "LogicalExpression") {
            // deepLogicalReplace(node.left);
            deepLogicalReplace(node.right);
            // if (['Literal', 'Identifier', 'BinaryExpression'].indexOf(node.right.type) > -1) {
            //     // 无意义
            //     return;
            // }
            if (node.operator === "&&") {
                node.test = node.left;
            }
            if (node.operator === "||") {
                node.test = {
                    type: "UnaryExpression",
                    operator: "!",
                    argument: node.left,
                    prefix: true
                };
            }
            if (['&&', '||'].indexOf(node.operator) > -1) {
                if (isExpression(node.right)) {
                    node.right = {
                        type: "ExpressionStatement",
                        expression: node.right
                    };
                }
                node.consequent = {
                    type: "BlockStatement",
                    body: [node.right]
                };
                parseBody(node.consequent.body, node.consequent);
                node.alternate = null;
                node.type = "IfStatement";
                delete node.operator;
                delete node.left;
                delete node.right;
            }
        }
        if (node.type === "ConditionalExpression") {
            deepLogicalReplace(node.consequent);
            deepLogicalReplace(node.alternate);
            if (isExpression(node.consequent)) {
                node.consequent = {
                    type: "ExpressionStatement",
                    expression: node.consequent
                };
            }
            if (isExpression(node.alternate)) {
                node.alternate = {
                    type: "ExpressionStatement",
                    expression: node.alternate
                };
            }
            node.consequent = {
                type: "BlockStatement",
                body: [node.consequent]
            };
            parseBody(node.consequent.body, node.consequent);
            node.alternate = {
                type: "BlockStatement",
                body: [node.alternate]
            };
            parseBody(node.alternate.body, node.alternate);
            node.type = "IfStatement";
        }
    };
    let removeLogicalExp = (node, key, body) => {
        if (node.type === "ExpressionStatement") {
            if (node.expression.type === "LogicalExpression" || node.expression.type === "ConditionalExpression") {
                deepLogicalReplace(node.expression);
                body[key] = node.expression;
            }
        }
    };
    //移除逗号
    bodyInserted = 0;
    body.map((node, key) => {
        removeComma(node, key + bodyInserted, body);
    });
    //移除三元、与或
    body.map((node, key, body) => {
        removeLogicalExp(node, key, body);
    });
    parent.bodyParsed = true;
};
let workDir = process.cwd();
readFold(workDir);
console.log('\033[43;30m INFO \033[40;33m Totally found ' + jsFileList.length + ' js files \033[0m');
console.log('\033[43;30m INFO \033[40;33m Dewebpack will start in 3 seconds... \033[0m');
setTimeout(()=>{
    let succeeded = 0;
    let failed = 0;
    jsFileList.forEach((file) => {
        try {
            let jsData = fs.readFileSync(file, 'utf-8');
            let syntax = esprima.parse(jsData);
            mapNode(syntax);
            let dewebpackedJs = unescape(escodegen.generate(syntax).replace(/\\/g, "%"));
            esprima.parse(dewebpackedJs);
            fs.writeFileSync(file, dewebpackedJs);
            succeeded++;
        } catch (e) {
            failed++;
            console.log('\033[41;30m FAIL \033[40;31m On dewebpacking [' + file.replace(path.join(workDir, '/'), '') + '] \033[0m');
        }
    });
    console.log('\033[42;30m DONE \033[40;32m Dewebpack finished \033[0m');
},3000);