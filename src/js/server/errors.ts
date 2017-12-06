import chalk from 'chalk';
import ErrorWithStatus from './error-with-status';

export function middleware(err: ErrorWithStatus, req, res, next) {
  const message = err.stack || err.toString();
  console.error(chalk.red.underline('Error occurred. We goofed.'));
  console.error(message);
  res.status(err.status || 500);

  const locals: any = { };

  if (req.app.get('env') === 'development') {
    locals.message = message;
  }

  res.render('error.html', locals);
};
