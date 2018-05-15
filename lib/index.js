const fse = require('fs-extra')
const process = require('process')
const path = require('path')
const chalk = require('chalk')
const util = require('./util')
const inquirer = require('inquirer')
var build = function (project) {

  var cwd = process.cwd()                           // 工作目录
  var zipPath = path.resolve(cwd, `${project}.zip`) // 下载资源存储路径
  var unzipPath = path.resolve(cwd, `${project}/`)  // 解压路径（项目目标路径）

  var config = fse.readJsonSync(path.resolve(__dirname, './config.json'))
  var choices = config[ 'project-choices' ]     // 待选项目模板
  console.log('-------可选项目说明--------')
  console.info(JSON.stringify(choices, null, 2))
  console.log('-------可选项目说明/--------')
  var asset = ''                      // 资源下载路径模板

  inquirer.prompt([ {
    name: 'assetChoice',
    type: 'list',
    message: 'Which project would you like to generate?',
    choices: Object.keys(choices),
  } ]).then((answer) => {
    if (answer.assetChoice) asset = choices[ answer.assetChoice ].asset
    console.log(`下载资源内容:${asset}`)
    util.projectDirCheck(unzipPath)
    .then(() => util.downloadAsset(asset, zipPath))
    .then(assetPath => util.unzipAsset(assetPath, unzipPath))
    .then(assetPath => util.moveAsset(assetPath, unzipPath))
    .then(assetPath => util.localizeAssert(assetPath))
    .then(info => util.initSentry(info))
    .then(path => console.log(chalk.green(`generate project ${project} successfully, check it in`), chalk.cyan(`${path}`)))
  })

}
module.exports.build = build

