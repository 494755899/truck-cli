/**
 * Created with WebStorm.
 * User: kevan
 * Email:258137678@qq.com
 * Date: 2018/3/16
 * Time: 下午2:55
 * To change this template use File | Settings | File Templates.
 */
const path = require('path')
const fs = require('fs')
const co = require('co')
const axios = require('axios')
const config = require('./config.json')
var pkg = {}
var syncPackageJson = function () {
  fs.writeFileSync(path.resolve('./package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
}
var getSentryConfig = function (name) {
  var team = config.sentry.team
  var organization = config.sentry.organization
  var instance = axios.create({
    baseURL: config.sentry.baseUrl
  })
  instance.defaults.headers.common[ 'Authorization' ] = config.sentry.Authorization

  return co(function * () {
    console.log(`/api/0/teams/${organization}/${team}/projects/`)
    var data = yield instance({
      method: 'post',
      url: `/api/0/teams/${organization}/${team}/projects/`,
      data: {
        name: name,
        platform: 'javascript-vue'
      }
    })
    pkg.sentry.project = data.data.slug
    console.log(`/api/0/projects/${organization}/${data.data.slug}/docs/`)
    var info = yield instance({
      method: 'get',
      url: `/api/0/projects/${organization}/${data.data.slug}/docs/`
    })
    return info.data.dsnPublic
  })
}
var replaceIndexTpl = function (assetPath, url) {
  var script = ` <% if (process.env.NODE_ENV === 'production') { %>
        <script src="//<%= htmlWebpackPlugin.options.env %>static.ymm56.com/common-lib/raven/raven.min.js"></script>
<script>Raven.config('${url}',{
  release:"<%= (htmlWebpackPlugin.options.version||'1.0.0') %>"
}).install();</script><% } %></html>`
  var indextpl = fs.readFileSync(path.resolve(assetPath, 'index.tpl'), 'utf-8')
  if (indextpl.indexOf('Raven.config') == -1) {
    indextpl = indextpl.replace('</html>', script)
    fs.writeFileSync(path.resolve(assetPath, 'index.tpl'), indextpl, 'utf-8')
  }
}
var replaceCookingConfig = function (assetPath, url) {
  var indextpl = fs.readFileSync(path.resolve(assetPath, 'cooking.conf.js'), 'utf-8')
  if (indextpl.indexOf('packageInfo.version') == -1) {
    indextpl = indextpl.replace('packageInfo.description,', `packageInfo.description,
      version: packageInfo.version,`)
    fs.writeFileSync(path.resolve(assetPath, 'cooking.conf.js'), indextpl, 'utf-8')
  }
}
var initSentry = function (assetPath) {
  pkg = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf-8'))
  pkg.sentry = Object.assign(pkg.sentry || {}, {
    project: '',
    team: config.sentry.team
  })
  var name = pkg.packageName || pkg.name
  var getInputs = function * () {
    // 更新 packageJSON
    // 替换index.tpl 文件
    var url = yield getSentryConfig(name)
    replaceIndexTpl(assetPath, url)
    replaceCookingConfig(assetPath)

    syncPackageJson()
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
  doing: initSentry
}
module.exports = util
