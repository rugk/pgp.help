var gulp = require('gulp');
var gulpLoadPlugins = require('gulp-load-plugins');
var $ = gulpLoadPlugins();
var merge = require('merge-stream');
var del = require('del');
var runSequence = require('run-sequence');

//You only need browserSync to serve, not to build.
var browserSync;
var reload;
try {
  browserSync = require('browser-sync');
  reload = browserSync.reload;
} catch (a) {
  console.log("No browserSync");
  console.log(a);
  reload = function() {};
};

//This is for github publishing from a local machine.
var extraArgs;
try {
  extraArgs = require('./sensitive/env.json');
} catch (a) {
  extraArgs = {};
};

//Config...

var DIST = 'dist/min/';
var DEBUGDIST = 'dist/debug/'

//
// Work starts here
//

gulp.task('bower', function() {
  return $.bower()
    .pipe(gulp.dest('bower_components/'))
});

gulp.task('clean:all', ['clean', 'clean:dist'], del.bind(null, ['bower_components']));
gulp.task('clean', del.bind(null, ['.tmp', 'dist']));
gulp.task('clean:dist', del.bind(null, ['.tmp/.publish']));

gulp.task('fonts', function() {
    var filterfont = $.filter('**/*.{eot,svg,ttf,woff,woff2}');
    var bowerfonts = gulp.src('./bower.json')
        .pipe($.mainBowerFiles());
    var appfonts = gulp.src('app/fonts/*');

    return merge(bowerfonts, appfonts)
        .pipe(filterfont)
        //.pipe($.debug({title: 'fonts'}))        
        .pipe($.flatten())
        .pipe(gulp.dest('.tmp/fonts')) //for serve
        .pipe(gulp.dest(DIST + 'fonts'))
        .pipe(gulp.dest(DEBUGDIST + 'fonts'));
});

gulp.task('extras', function() {
  //favicon, and pictures.
  return gulp.src([
      'app/*.png',
      'LICENSE',
      'README.md',
    ], {
      dot: true
    })
    .pipe(gulp.dest(DIST))
    .pipe(gulp.dest(DEBUGDIST));
});

gulp.task('markdown:readme', function () {
    return gulp.src(['docs/readme-pre.md', 'docs/introdoc.md'])
        .pipe($.concat('README.md'))
        .pipe(gulp.dest('.'));
});

gulp.task('markdown:docs', function () {
    return gulp.src('docs/*.md')
        .pipe($.markdown())
        .pipe(gulp.dest('.tmp/templates'));
});

gulp.task('markdown', ['markdown:readme', 'markdown:docs'], function() {
  return
});

function lint(files, options) {
  return function() {
    return gulp.src(files)
      .pipe(reload({stream: true, once: true}))
      .pipe($.eslint(options))
      .pipe($.eslint.format())
      .pipe($.if(!browserSync.active, $.eslint.failAfterError()));
  };
};

gulp.task('lint', lint('app/scripts/**/*.js'));


gulp.task('serve', ['fonts', 'bower'], function() {

  var port = 9000;

  browserSync({
    notify: false,
    port: port,
    rewriteRules: [
      {
          match: /<meta http-equiv="Content-Security-Policy" content=".*">/,
          fn: function (match) {
              var ret = "default-src 'none'; script-src 'self' 'sha256-dU4exL-Fu8MTHLyLOAFLnhSp1aGnPtTXhZwXTX6xAn8='; style-src 'self'; font-src 'self'; img-src 'self'; connect-src http://localhost:" + port + " ws://localhost:" + port
              ret = "<meta http-equiv=\"Content-Security-Policy\" content=\"" + ret + "\">";              
              return ret;
          }
      }
    ],
    server: {
      baseDir: ['.tmp', 'app'],
      routes: {
        '/bower_components': 'bower_components'
      }
    }
  });

  gulp.watch([
    'app/*.html',
    'app/scripts/**/*.js',
    'app/images/**/*',
    '.tmp/fonts/**/*'
  ]).on('change', reload);

  //gulp.watch('app/styles/**/*.scss', ['styles']);
  //gulp.watch('app/fonts/**/*', ['fonts']);
  gulp.watch('bower.json', ['fonts']);
});

gulp.task('templates', ['markdown'], function() {  
  return gulp.src(['app/templates/**/*.html','.tmp/templates/**/*.html'])
    .pipe($.angularTemplatecache("templates.js", {module: "pgpApp", root: "templates"}))
    .pipe(gulp.dest(DEBUGDIST + "js"))
    .pipe(gulp.dest(".tmp/pre/" + "js"));
});

gulp.task('html', ['templates'], function() {
  //Prefer to find assets in .tmp than app - which means templates.js will have the built version.
  var assets = $.useref.assets({
    searchPath: ['.tmp', '.tmp/pre/', 'app', '.']
  });

  var jsFilter = $.filter('**/*.js', {restore: true});
  var cssFilter = $.filter('**/*.css', {restore: true});

  return gulp.src(['app/*.html'])
    .pipe(assets)
    //filtr js
    .pipe(jsFilter)
    .pipe($.ngAnnotate())
    .pipe($.uglify())
    .pipe(jsFilter.restore)
    //CSS
    //.pipe(cssFilter)
    //TODO: This isn't "just working" for some reason
    //.pipe($.minifyCss({compatibility: '*'}))
    //.pipe(cssFilter.restore)
    .pipe(assets.restore())
    .pipe($.useref())
    //html
    //.pipe($.if('*.html', $.minifyHtml({conditionals: true, loose: true})))
    .pipe(gulp.dest(DIST));
});

gulp.task('debugdist', ['templates'], function() {
  var assets = $.useref.assets({
    searchPath: ['.tmp', 'app', '.'],
    noconcat : true
  })
  var htmlFilter = $.filter('*.html', {restore: true});

  return gulp.src(['app/*.html'])      
    .pipe(assets)
    .pipe($.flatten({newPath:'extras'}))
    .pipe(assets.restore())
    //.pipe($.useref()) //Can't use this. Will transform manually...
    .pipe(htmlFilter)    
    .pipe($.replace(/stylesheet\" href=\".*\/(.*\.css)\"/g,'stylesheet" href="extras/$1"'))
    .pipe($.replace(/script src=\".*\/(.*\.js)\"/g,'script src="extras/$1"'))    
    .pipe(htmlFilter.restore)

    .pipe(gulp.dest(DEBUGDIST))
})

gulp.task('build', function() {
  runSequence(
    'bower',
    'clean',
    ['debugdist', 'html', 'fonts', 'extras']
  );
  //dump some size info
  return gulp.src('dist/**/*').pipe($.size({title: 'build', gzip: true}));
});

gulp.task('test', function() {
  //TODO: Guess I should do something here - but hey, it at least requires
  //a build to pass!
  runSequence(
    'build'
    //Actual test goes here!
  );
});

gulp.task('bump', function() {
  return gulp.src(['./package.json', './bower.json'])
    .pipe($.bump())
    .pipe(gulp.dest('./'))
});

gulp.task('gh-pages', ['clean:dist'], function() {

  var token = process.env.GH_TOKEN || extraArgs.GH_TOKEN;
  var ref = process.env.GH_REF || extraArgs.GH_REF;
  var branch = process.env.GH_BRANCH || extraArgs.GH_BRANCH;

  //TODO: calculate cname from gh_ref
  var cname = process.env.CNAME || extraArgs.CNAME;
  
  var options = {
    remoteUrl: "https://" +token +"@" + ref,
    branch: branch,
    cacheDir: ".tmp/.publish",
  };

  return gulp.src(DIST + '**/*')
    .pipe($.file("CNAME", cname))
    .pipe($.debug({title: "gh-pages"}))
    .pipe($.ghPages(options));
});

gulp.task('default', ['clean'], function() {
  gulp.start('build');
});

gulp.task('dist', function() {
  //I get a bit confused about how dependencies work
  //But basically only run this after a build.
  runSequence(
    'gh-pages'
  )
})
