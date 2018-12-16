import { Router } from 'express';

import { getCsvOfHackersWithUnfinishedApplications, UnfinishedApplicationKind } from 'server/apply/applicant-info';
import { Hacker, HackerApplication } from 'server/models';
import * as responseLogic from 'server/review/response-logic';
import { getApplicationsWithScores } from 'server/review/score-logic';

const applicationsRouter = Router();

applicationsRouter.get('/', (_req, res, next) => {
  getApplicationsWithScores().then(applications => {
    res.json({
      applications,
    });
  }).catch(next);
});

applicationsRouter.get('/:applicationId', (req, res, next) => {
  HackerApplication
    .findOne({
      where: {
        id: req.params.applicationId,
      },
      include: [
        {
          model: Hacker,
          required: true,
        },
      ],
    })
    .then(application => {
      if (!application) {
        next();
        return;
      }

      res.json({
        application,
      });
    })
    .catch(next);
});

/**
 * Sets a response for an individual application. Expects a response type in its body:
 *
 * ```
 * {
 *   "response": "invited"
 * }
 * ```
 */
applicationsRouter.post('/:applicationId/response', (req, res, next) => {
  HackerApplication.findOne({
    where: {
      id: req.params.applicationId,
    },
  }).then(application => {
    if (!application) {
      next();
      return;
    }

    return responseLogic
      .setResponseForApplicationWithChecks(application, req.body.response)
      .then(applicationResponse => {
        res.json(applicationResponse);
      });
  }).catch(next);
});

applicationsRouter.get('/unfinished/:kind', async (req, res, next) => {
  try {
    const kind = req.params.kind;
    console.assert(kind === UnfinishedApplicationKind.INDIVIDUAL || kind === UnfinishedApplicationKind.TEAM_ONLY);
    const csv = await getCsvOfHackersWithUnfinishedApplications(kind);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

export default applicationsRouter;
