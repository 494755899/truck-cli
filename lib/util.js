const request = require('request')
const fse = require('fs-extra')
const process = require('process')
const path = require('path')
const inquirer = require('inquirer')
const chalk = require('chalk')
const unzip = require('unzip')
const fs = require('fs')
const querystring = require('querystring')
const replaceStream = require('replacestream')
const http = require('http')
const co = require('co')
const axios = require('axios')
const config = require('./config.json')
var pkg = {}
var syncPackageJson = function (url) {
  fs.writeFileSync(url, JSON.stringify(pkg, null, 2), 'utf-8')
}
var projectDirCheck = function (projectDir) {
  return new Promise((resolve, reject) => {
    fse.stat(projectDir, (error, stats) => {
      if (error) {
        resolve()
      } else {
        inquirer.prompt([ {
          name: 'rmDir',
          type: 'confirm',
          message: `${projectDir} already exists, would you like to remove this folder for creating a new one with the same path?`
        } ]).then((answer) => {
          if (!answer.rmDir) process.exit()

          fse.remove(projectDir, (error) => {
            if (error) {
              console.log(chalk.red(error.toString()))
            } else {
              console.log('remove', chalk.green(` ${projectDir} `), 'success.')
              resolve()
            }
          })
        })
      }
    })
  })
}

var downloadAsset = function (asset, target) {
  return new Promise((resolve, reject) => {
    var writeStream = fse.createWriteStream(target)
    // writeStream.on('close', () => console.log('\n'))
    writeStream.on('finish', () => {
      console.log('fetch data end.')
      resolve(target)
    })
    request.get(asset)
    .on('response', () => console.log('fetch data form ', chalk.green(`${asset}`)))
    .on('error', error => console.log(chalk.red(error.toString())))
    .pipe(writeStream)
  })
}

var unzipAsset = function (zipPath, unzipPath) {
  return new Promise((resolve, reject) => {
    console.log('start unzip...')
    var readstream = fse.createReadStream(zipPath)
    readstream.on('close', () => {
      console.log('unzip data end.')
      fse.remove(zipPath)
      setTimeout(function () {
        // give this some time
        resolve(unzipPath)
      }, 500)
    })
    readstream.pipe(unzip.Extract({ path: unzipPath }))
  })
}

var moveAsset = function (assetPath, targetPath) {
  return new Promise((resolve, reject) => {
    console.log('move file start...')
    fse.readdir(assetPath, (error, files) => {
      var folder = files.filter(item => !/^\.+$/.test(item))[ 0 ]
      if (!folder) throw new Error(`no templete find in ${assetPath}`)

      folder = path.resolve(assetPath, folder)
      fse.copy(folder, targetPath, (error) => {
        fse.removeSync(folder)

        if (error) console.log(chalk.red(error.toString()))
        else {
          console.log('move file end.')
          resolve(targetPath)
        }
      })
    })
  })
}

var localizeAssert = function (assetPath) {
  var localizeJson = path.resolve(assetPath, './localize.json')
  var config = fse.readJsonSync(localizeJson)
  fse.remove(localizeJson, (error) => {})

  var replaceMap = (config || {}).keymap || {}          // 模板本地化的关键字替换map
  var exclude = (config || {}).exclude || []            // 替换搜索排除的文件或目录 xPath，不支持通配符

  function replaceFile (file, map) {
    var reg = /<%=\s*(\w+)\s*%>/gm
    var replaceFn = function (m, p1) {
      console.log('match: ', chalk.cyan(file), ' ', chalk.red(m))
      return map[ p1 ]
    }

    var writeStream = fse.createWriteStream(`${file}\.tmp`)
    writeStream.on('finish', () => {
      fse.removeSync(file)
      fse.rename(`${file}\.tmp`, file)
    })

    var readStream = fse.createReadStream(file)
    .pipe(replaceStream(reg, replaceFn))
    .pipe(writeStream)
  }

  var filterFn = function (item) {
    for (var line of exclude) {
      if (path.resolve(assetPath, line) === item) return false
    }
    if (/^[\w\\\/\.:-]+[\\\/]\.\w+$/.test(item)) return false // 过滤 .name类型文件
    return true
  }

  var getInputs = function * (inputsMap) {
    var prompt = function (name, msg) {
      return inquirer.prompt([ {
        name: name,
        type: 'input',
        message: msg
      } ])
    }
    var key
    var value
    for (key of Object.keys(inputsMap)) {
      value = yield prompt(key, inputsMap[ key ])
      inputsMap[ key ] = value[ key ]
    }

    return inputsMap
  }

  return new Promise((resolve, reject) => {
    // 获取用户输入
    co(getInputs.bind(this, Object.assign({}, replaceMap))).then((data) => {
      replaceMap = data

      console.log('replaceMap:\n', replaceMap)
      console.log('exclude:\n', exclude)

      console.log('localize file start...')

      fse.walk(assetPath, { filter: filterFn })
      .on('data', (file) => {
        if (file && file.stats.isFile()) {
          console.log('try to localize file: ', chalk.green(file.path))
          replaceFile(file.path, replaceMap)
        }
      })
      .on('end', () => {
        setTimeout(() => {
          console.log('localize file end.')
          resolve({ assetPath, name: data.name })
        }, 500)
      })
    })
  })
}

var getSentryConfig = function (name) {
  var team = config.sentry.team
  var organization = config.sentry.organization
  var instance = axios.create({
    baseURL: config.sentry.baseUrl
  })
  instance.defaults.headers.common[ 'Authorization' ] = config.sentry.Authorization

  return co(function * () {
    var data = yield instance({
      method: 'post',
      url: `/api/0/teams/${organization}/${team}/projects/`,
      data: {
        name: name,
        platform: 'javascript-vue'
      }
    })
    pkg.sentry.project = data.data.slug
    var info = yield instance({
      method: 'get',
      url: `/api/0/projects/${organization}/${data.data.slug}/docs/`
    })
    return info.data.dsnPublic
  })
}
var initSentry = function ({ assetPath, name }) {
  pkg = JSON.parse(fs.readFileSync(path.resolve(assetPath, './package.json'), 'utf-8'))
  pkg.sentry = Object.assign(pkg.sentry || {}, {
    project: '',
    team: config.sentry.team
  })
  console.log(pkg)
  var getInputs = function * () {
    var value = yield inquirer.prompt([ {
      name: 'sentry',
      type: 'input',
      message: '是否添加错误监控 y:添加，n:不添加'
    } ])
    if (value.sentry == 'y') {
      var url = yield getSentryConfig(name)
      var script = ` <% if (process.env.NODE_ENV === 'production') { %>
        <script src="//<%= htmlWebpackPlugin.options.env %>static.ymm56.com/common-lib/raven/raven.min.js" ></script>
<script>Raven.config('${url}',{
  release:"<%= (htmlWebpackPlugin.options.version||'1.0.0') %>"
}).install();</script><% } %></html>`
      console.log('替换根目录下的 index.tpl 文件')
      console.log(script)
      var indextpl = fs.readFileSync(path.resolve(assetPath, 'index.tpl'), 'utf-8')
      indextpl = indextpl.replace('</html>', script)
      fs.writeFileSync(path.resolve(assetPath, 'index.tpl'), indextpl, 'utf-8')

      syncPackageJson(path.resolve(assetPath, './package.json'))
    } else {
      console.log('跳过监控代码添加')
    }

    return assetPath
  }
  return new Promise((resolve, reject) => {
    // 获取用户输入
    co(getInputs.bind(this)).then((data) => {
      resolve(assetPath)
    })
  })
}

var util = {
  projectDirCheck: projectDirCheck,
  downloadAsset: downloadAsset,
  unzipAsset: unzipAsset,
  moveAsset: moveAsset,
  localizeAssert: localizeAssert,
  initSentry: initSentry
}

module.exports = util
