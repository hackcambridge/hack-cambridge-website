import countryList from 'country-list';
import { NextFunction, Response } from 'express';
import { RequestHandlerParams } from 'express-serve-static-core';
import { checkSchema, validationResult, ValidationSchema } from 'express-validator/check';
import { generateCombination } from 'gfycat-style-urls';
import * as validator from 'validator';

import * as emailTemplates from 'server/apply/email-templates';
import { s3Upload } from 'server/apply/file-upload';
import { sendEmail } from 'server/email';
import { Hacker, HackerApplication } from 'server/models';
import { UserRequest } from 'server/routes/apply-router';

// Optimise the list creation by only making it once, lazily.

function createCountryChoices(): { [id: string]: string }  {
  const choices: { [code: string]: string } = {};

  // Add an invalid placeholder so that the user doesn't accidentally miss this box.

  choices[''] = 'Choose a country…';

  // Add United Kingdom to the top of the country choices since it is the most likely to be applicable.

  choices.GB = 'United Kingdom';
  countryList().getData().forEach(({ code, name }) => {
    choices[code] = name;
  });
  return choices;
}

const countryChoices = createCountryChoices();

const schema: ValidationSchema = {
  cv: {
    in: 'params',
    exists: {
      options: { checkFalsy: true },
      errorMessage: 'Select a file',
    },
    custom: {
      options: (value, { req }) => {
        if (value.error) {
          throw value.error;
        } else if (!req.file) {
          throw new Error('File not selected.');
        } else {
          return true;
        }
      }
    }
  },
  countryTravellingFrom: {
    in: 'body',
    exists: {
      options: { checkFalsy: true },
      errorMessage: 'Fill out this field',
    },
  },
  goals: {
    in: 'body',
    exists: {
      options: { checkFalsy: true },
      errorMessage: 'Fill out this field',
    },
  },
  interests: {
    in: 'body',
    exists: {
      options: { checkFalsy: true },
      errorMessage: 'Fill out this field',
    },
  },
  accomplishment: {
    in: 'body',
    exists: {
      options: { checkFalsy: true },
      errorMessage: 'Fill out this field',
    },
  },
  links: {
    in: 'body',
    exists: true,
    custom: {
      errorMessage: 'All the links must be valid.',
      options: value => {
        if (value === '') {
          return true;
        } else {
          return value.split(/\r?\n/).every(link =>
            validator.isURL(link, {
              allow_underscores: true,
              protocols: ['http', 'https']
            })
          );
        }
      },
    },
  },
  teamMembership: {
    in: 'body',
    exists: {
      errorMessage: 'Select this tickbox',
    },
  },
  confirmations: {
    in: 'body',
    exists: true,
    custom: {
      errorMessage: 'You must confirm your student status, and accept the terms and conditions, privacy policy' +
        ', the MLH Code of Conduct, and the sharing of your data with MLH.',
      options: value => {
        if (value === undefined) {
          return true;
        } else {
          return value.includes('studentStatus') && value.includes('termsAndConditions') &&
            value.includes('mlhCodeOfConduct') && value.includes('mlhDataProcessing');
        }
      },
    },
  },
  graduationMonth: {
    in: 'body',
    exists: true,
    isISO8601: {
      errorMessage: 'Invalid date',
      options: {
        strict: true,
      },
    },
  },
  visaNeededBy: {
    in: 'body',
    optional: {
      nullable: true,
      checkFalsy: true,
    },
    custom: {
      errorMessage: 'Invalid date',
      options: value => {
        if (value === '') {
          return true;
        } else {
          return validator.isISO8601(value);
        }
      },
    },
  },
};

const cvUpload = s3Upload({
  maxFields: 30,
  maxFileSize: 1024 * 1024 * 2,
  mediaType: {
    type: 'application/pdf',
    error: 'File is not a PDF.',
  },
  missing: {
    error: 'File is missing.'
  },
}).single('cv');

export function newHackerApplication(_req: UserRequest, res: Response) {
  res.render('apply/application-form', { countryChoices });
}

export const createHackerApplication: RequestHandlerParams = [
  (req: UserRequest, res: Response, next: NextFunction) => {
    cvUpload(req, res, err => {
      req.params.cv = err ? { error: err } : true;
      next();
    });
  },
  ...checkSchema(schema),
  (req: UserRequest, res: Response, _next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.render('apply/application-form', {
        errors: errors.mapped(),
        countryChoices,
        formData: req.body,
      });
    } else {
      createApplicationFromForm(req.body, req.user, req.file).then(application => {
        res.redirect(application.inTeam ? 'team' : 'dashboard');
      }).catch(error => {
        res.render('apply/application-form', {
          formData: req.body,
          error,
          countryChoices,
        });
      });
    }
  }
];

async function createApplicationFromForm(body, user: Hacker, file): Promise<HackerApplication> {
  const applicationSlug: string = generateCombination(2, '-').toLowerCase();
  try {
    const application = await HackerApplication.create({
      // Foreign key
      hackerId: user.id,
      // Application
      applicationSlug,
      cv: file ? file.location : null,
      countryTravellingFrom: body.countryTravellingFrom,
      developmentRoles: body.roles || [],
      learningGoal: body.goals,
      interests: body.interests,
      recentAccomplishment: body.accomplishment,
      links: body.links,
      inTeam: body.teamMembership.includes('apply'),
      wantsTeam: body.teamMembership.includes('placement'),
      needsVisa: Boolean(body.needsVisaBy),
      visaNeededBy: body.visaNeededBy || null,
      wantsMailingList: Boolean(body.wantsMailingList),
      graduationDate: body.graduationMonth,
      otherInfo: body.otherInfo || null,
    });

    await sendEmail({
      to: user.email,
      contents: emailTemplates.applied({
        name: user.firstName,
        applicationSlug: application.applicationSlug,
        inTeam: application.inTeam,
      }),
    });

    console.log('Application made successfully');

    return application;
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError' && err.errors[0].path === 'applicationSlug') {
      // slug was not unique, try again with new slug
      console.error('Application slug collision detected');
      return createApplicationFromForm(body, user, file);
    } else {
      console.error('Failed to add an application to the database');
      return Promise.reject(err);
    }
  }
}
