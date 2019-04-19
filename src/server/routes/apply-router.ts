import { Request, Response, Router } from 'express';

import { logout, requireAuth } from 'server/auth';
import { dashboardController, hackerApplicationsController, rsvpsController, teamsController } from 'server/controllers/apply';
import { applicationsMiddleware } from 'server/middleware';
import { Hacker } from 'server/models';

const applyRouter = Router();

export interface UserRequest extends Request {
  user: Hacker;
}

applyRouter.get('/', (req: UserRequest, res: Response) => req.user ? res.redirect('/apply/dashboard') : res.render('apply/login'));

applyRouter.use(requireAuth);

applyRouter.get('/logout', logout, (_req: UserRequest, res: Response) => res.redirect('/'));

applyRouter.get('/dashboard', dashboardController.showDashboard);

applyRouter.route('/form')
  .all(applicationsMiddleware.goBackIfApplied, applicationsMiddleware.goBackIfApplicationsClosed)
  .get(hackerApplicationsController.newHackerApplication)
  .post(hackerApplicationsController.createHackerApplication);

applyRouter.route('/team')
  .all(applicationsMiddleware.goBackIfApplicationsClosed)
  .get(teamsController.newTeam)
  .post(teamsController.createTeam);

// Process the RSVP response
applyRouter.post('/rsvp', rsvpsController.createRsvp);

export default applyRouter;
