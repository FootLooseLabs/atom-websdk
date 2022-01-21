const path = require('path');

var gulp = require('gulp');
var concat = require('gulp-concat');
var concatCss = require('gulp-concat-css');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var uglifyCss = require('gulp-uglifycss');
var htmlmin = require('gulp-htmlmin');
var inlinesource = require('gulp-inline-source');
var run = require('gulp-run-command').default;
var del = require("del");
const headerComment = require('gulp-header-comment');

var srcDir = "src/"
var distDir = "dist/"

//VARIABLES
var cmpDistTmpFile = "build/sdk.js";
var jsFiles = ['./lib/*.js', '../node_modules/muffin/dist/muffin.min.js'];
var jsDest = '/';

var htmlFiles = ['index.src.html'];
var htmlDest = '.';


var getSrcDirs = (_dirs) => {
    return _dirs.map((_dir) => {
        return path.join(srcDir, _dir);
    });
}

var getDestDir = (_dir) => {
    return path.join(distDir, _dir);
}


gulp.task('buildes6js', run("./node_modules/.bin/rollup -c"));


gulp.task('buildJs', function () {
    return gulp.src([].concat(getSrcDirs(jsFiles), cmpDistTmpFile))
        .pipe(concat('sdk.js'))
        // .pipe(gulp.dest(jsDest))
        .pipe(rename('sdk.min.js'))
        // .pipe(uglify())
        .pipe(headerComment(`
    License: <%= pkg.license %>
    Generated on <%= moment().format('YYYY') %>
    Author: <%= _.capitalize(pkg.author) %>
    Version: <%= pkg.version %>
  `))
        .pipe(gulp.dest(getDestDir(jsDest)));
});

gulp.task('buildHtml', () => {
    var options = {
        compress: false,
        attribute: 'inline-src'
    };
    return gulp.src(getSrcDirs(htmlFiles))
        .pipe(htmlmin({collapseWhitespace: true}))
        .pipe(rename('index.html'))
        .pipe(gulp.dest(getDestDir(htmlDest)))
        .pipe(inlinesource(options))
        .pipe(gulp.dest(getDestDir(htmlDest)));
});

sanitise = () => {
    del('_cmps_tmp', {force: true})
}

gulp.task('buildAll', gulp.series('buildes6js', 'buildJs', function done(done) {
    sanitise();
    done();
}));
