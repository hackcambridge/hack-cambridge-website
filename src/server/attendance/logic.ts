import * as moment from 'moment';
import * as Sequelize from 'sequelize';

import { sendEmail } from 'server/email';
import { ApplicationResponse, ApplicationTicket, db, Hacker, HackerApplication, ResponseRsvp } from 'server/models';
import { INVITATION_VALIDITY_DURATION } from 'server/review/constants';
import * as slack from 'server/slack';
import { CompleteRsvpStatus, ResponseStatus } from 'shared/statuses';
import * as emailTemplates from './email-templates';

/**
 * Creates a ticket for an application.
 *
 * Sends an email and Slack invite to the user.
 */
async function createTicket(
  application: HackerApplication,
  transaction: Sequelize.Transaction): Promise<ApplicationTicket> {
  const applicationTicket = await ApplicationTicket.create({
      hackerApplicationId: application.id,
    }, { transaction });

  const hacker = await application.getHacker({ transaction });
  Promise.all([
      slack.inviteUser(hacker.email, hacker.firstName, hacker.lastName),
      sendTicketEmail(hacker)
    ]).catch(error => {
      // Not doing anything on error as there is no way to recover
      console.error(error);
    });
  return applicationTicket;
}

function sendExpiryEmail(hacker: Hacker) {
  console.log(`Sending invitation expiry email for hacker ${hacker.id}`);

  return sendEmail({
    to: hacker.email,
    contents: emailTemplates.expiry({ name: hacker.firstName, daysValid: INVITATION_VALIDITY_DURATION.asDays() }),
  });
}

function sendTicketEmail(hacker: Hacker) {
  console.log(`Sending ticket email for hacker ${hacker.id}`);

  return sendEmail({
    to: hacker.email,
    contents: emailTemplates.newTicket({ name: hacker.firstName }),
  });
}

/**
 * Get all invitations that are old enough to expire. Responses are hydrated with application and hacker objects
 */
export function getInvitationExpiryCandidates(durationAgoExpired: moment.Duration) {
  return ApplicationResponse.findAll({
    where: {
      expiryDate: {
        [Sequelize.Op.lt]: moment().subtract(durationAgoExpired).toDate(),
      },
      response: ResponseStatus.INVITED,
      responseRsvp: null
    },
    include: [
      ResponseRsvp,
      {
        model: HackerApplication,
        include: [Hacker]
      }
    ]
  });
}

/**
 * Expire an invitation and email the invitation holder about this
 *
 * @param {Response} response - The response object to expire. Must represent an invitation
 *   and have its application with hacker hydrated.
 */
export function expireInvitation(applicationResponse: ApplicationResponse) {
  if (applicationResponse.response !== ResponseStatus.INVITED) {
    return Promise.reject('Response is not an invitation.');
  }

  return ResponseRsvp.create({
    applicationResponseId: applicationResponse.id,
    rsvp: CompleteRsvpStatus.RSVP_EXPIRED,
  }).then(responseRsvp =>
    sendExpiryEmail(applicationResponse.hackerApplication.hacker)
      .catch(() => {
        // Not doing anything on error as there is no way to recover
      })
      .then(() => responseRsvp)
  );
}

/**
 * Adds an RSVP for a particular application response.
 *
 * If the RSVP is yes, then a ticket will be added to the application.
 */
export function rsvpToResponse(applicationResponse: ApplicationResponse, rsvpStatus: CompleteRsvpStatus) {
  if (applicationResponse.response !== ResponseStatus.INVITED) {
    return Promise.reject('Response is not an invitation.');
  }

  return db.transaction(transaction =>
    ResponseRsvp.create({
      applicationResponseId: applicationResponse.id,
      rsvp: rsvpStatus,
    }, { transaction }).then(responseRsvp => {
      if (responseRsvp.rsvp === CompleteRsvpStatus.RSVP_YES) {
        return applicationResponse
          .getHackerApplication({ transaction })
          .then(application => createTicket(application, transaction))
          .then(() => responseRsvp);
      }

      return responseRsvp;
    })
  );
}

/**
 * Gets all tickets with information about the applicant
 */
export function getTicketsWithApplicantInfo() {
  return ApplicationTicket.findAll({
    include: [
      {
        model: HackerApplication,
        required: true,
        include: [
          {
            model: Hacker,
            required: true,
          },
        ],
      },
    ],
  }).then(tickets => tickets.map(ticket => {
    const application = ticket.hackerApplication;
    const hacker = application.hacker;

    return {
      slug: application.applicationSlug,
      firstName: hacker.firstName,
      lastName: hacker.lastName,
      gender: hacker.gender,
      country: application.countryTravellingFrom,
      institution: hacker.institution,
      email: hacker.email,
      phoneNumber: hacker.phoneNumber,
      shirtSize: hacker.shirtSize,
      dietaryRestrictions: hacker.dietaryRestrictions,
      specialNeeds: (application.hacker.specialNeeds == null) ? '' : application.hacker.specialNeeds,
      dateOfBirth: application.hacker.dateOfBirth,
    };
  }));
}
