let fs = require('fs');

let gulp = require('gulp');
let sass = require('gulp-sass');
let postcss = require('gulp-postcss');
let autoprefixer = require('autoprefixer');

let sassFiles = './sass/**/*.scss';

gulp.task('sass', () => {
  let processors = [
    autoprefixer({ browsers: ['last 2 versions'] })
  ];

  return gulp.src(sassFiles, {base: './sass'})
    .pipe(sass({outputStyle: 'compressed'}).on('error', sass.logError))
    .pipe(postcss(processors))
    .pipe(gulp.dest('./static/'))
});

gulp.task('watch', () => {
  gulp.watch(sassFiles, ['sass']);
});

