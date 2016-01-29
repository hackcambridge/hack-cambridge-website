'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var argv = require('yargs').argv;
var path = require('path');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var del = require('del');
var browserify = require('browserify');
var sequence = require('run-sequence');
var bs = require('browser-sync').create();
var nodemon = require('nodemon');

var prod = !!argv.prod || process.env.NODE_ENV == 'production';

console.log(argv);

var onError = function onError(err) {
  $.util.beep();
  console.log(err);
  this.emit('end');
};

gulp.task('clean', function () {
  return del('assets/dist');
});

// css
gulp.task('styles', function () {
  gulp.src('assets/styles/main.styl')
    .pipe($.if(!prod, $.sourcemaps.init()))
    .pipe($.stylus({
      'include css': true,
      paths: ['./node_modules'],

    }))
    .pipe($.autoprefixer())
    .pipe($.if(!prod, $.sourcemaps.write()))
    .pipe(gulp.dest('assets/dist/styles'))
    .pipe(bs.stream());;
});

// js
gulp.task('scripts', function () {
  var gulpBrowserify = function (fileIn, fileOut) {
    return browserify({
      entries: fileIn,
      debug: !prod,
      paths: [path.dirname(fileIn), './']
    })
    .transform('babelify', { presets: ['es2015'] })
    .bundle()
    .on('error', onError)
    .pipe(source(fileOut))
    .pipe(buffer());
  };

  return gulpBrowserify('./assets/scripts/main.js', 'main.js')
    .pipe($.if(!prod, $.sourcemaps.init({ loadMaps: true })))
    .pipe($.if(prod, $.uglify()))
    .pipe($.if(!prod, $.sourcemaps.write()))
    .pipe(gulp.dest('assets/dist/scripts'))
    .pipe(bs.stream());;
});

var assetPath = ['assets/**', '!assets/scripts/**', '!assets/styles/**', '!assets/dist/**'];

// other assets
gulp.task('assets', function () {
  return gulp.src(assetPath)
    .pipe(gulp.dest('assets/dist'))
    .pipe(bs.stream({ once: true }));
});

gulp.task('rev', function () {
  var rev = new $.revAll();

  return gulp.src('assets/dist/**')
    .pipe(rev.revision())
    .pipe(gulp.dest('assets/dist'))
    .pipe(rev.manifestFile())
    .pipe(gulp.dest('assets/dist'));
});

gulp.task('wait', function (cb) {
  setTimeout(cb, 2000);
});

gulp.task('watch', ['build'], function () {
  gulp.watch(['assets/scripts/**', 'lib/**'], ['scripts']);
  gulp.watch('assets/styles/**', ['styles']);
  gulp.watch(['views/**', 'resources/**'], bs.reload)
  gulp.watch(assetPath, ['assets']);
});

gulp.task('serve', ['watch'], function () {
  var runnode = function (env) {
    nodemon({
      script: 'index.js',
      ext: 'js',
      ignore: ['assets/**', 'gulpfile.js'],
      env: env || { }
    });
  }

  console.log(argv.nobs);

  if (argv.nobs) {
    bs.init({
      port: 8000,
      logSnippet: false
    }, function (err) {
      runnode({
        BS_SNIPPET: bs.getOption('snippet')
      });
    });
  } else {
    runnode();
  }
});

gulp.task('build', function (cb) {
  var args = ['clean', 'assets', 'scripts', 'styles'];

  if (prod) {
    // HACK: Waiting for a little bit means all of the assets actually get rev'd
    args.push('wait');
    args.push('rev');
  }

  args.push(cb);

  sequence.apply(null, args);
});
