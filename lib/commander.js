/**
 * Created with WebStorm.
 * User: kevan
 * Email:258137678@qq.com
 * Date: 2018/3/13
 * Time: 下午1:53
 * To change this template use File | Settings | File Templates.
 */
const fse = require('fs-extra')
const process = require('process')
const commander = require('commander')
const builder = require('./index')
const path = require('path')
const package = fse.readJsonSync(path.resolve(__dirname, '../package.json'))
const chalk = require('chalk')
const util = require('./util')
const sentryUpgrade = require('./sentryUpgrade')
const inquirer = require('inquirer')

commander
.version(package.version)
.option('-p, --project [name]', 'name the project')
.option('-u, --upgrade [name]', '升级项目添加sentry相关代码sentry, ')
.parse(process.argv);

var project = commander.project            // 项目名

if (project) {
  builder.build(project)
}

if (commander.upgrade == 'sentry') {
  sentryUpgrade.doing(path.resolve('./'))
}