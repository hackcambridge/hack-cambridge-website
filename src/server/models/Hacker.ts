import * as moment from 'moment';
import * as Sequelize from 'sequelize';
import { HasOneGetAssociationMixin, Model } from 'sequelize';

import { assertNever } from 'shared/common';
import * as dates from 'shared/dates';
import { ApplicationsOpenStatus, CompleteRsvpStatus, HackerStatuses, IndividualApplicationStatus, IndividualHackerStatuses,
  OverallStatus, ResponseStatus, RsvpStatus, TeamApplicationStatus, TicketStatus } from 'shared/statuses';
import db from './db';
import { HackerApplication } from './HackerApplication';
import { TeamMember } from './TeamMember';

async function getTeamApplicationStatus(hackerInstance: Hacker): Promise<TeamApplicationStatus | null> {
  const hackerApplication = await hackerInstance.getHackerApplication();
  if (hackerApplication === null) { return null; }
  const teamMember = await hackerInstance.getTeamMember();
  if (teamMember === null) {
    if (hackerApplication.wantsTeam) {
      // User wants us to place them in team
      return TeamApplicationStatus.WANTS_TEAM;
    }
    if (!hackerApplication.inTeam) {
      // User didn't apply as part of a team
      return TeamApplicationStatus.NOT_APPLICABLE;
    }
    return TeamApplicationStatus.INCOMPLETE;
  } else {
    // User is listed in a team application
    return TeamApplicationStatus.COMPLETE;
  }
}

async function getResponseStatus(hackerInstance: Hacker): Promise<ResponseStatus | null> {
  const hackerApplication = await hackerInstance.getHackerApplication();
  if (hackerApplication === null) { return null; }
  return hackerApplication.getApplicationResponse().then(applicationResponse => {
    if (applicationResponse === null) {
      // No response yet
      return ResponseStatus.PENDING;
    }
    return applicationResponse.response;
  });
}

function convertToRsvpStatus(completeRsvpStatus: CompleteRsvpStatus) {
  switch (completeRsvpStatus) {
    case CompleteRsvpStatus.RSVP_YES:
      return RsvpStatus.COMPLETE_YES;
    case CompleteRsvpStatus.RSVP_NO:
      return RsvpStatus.COMPLETE_NO;
    case CompleteRsvpStatus.RSVP_EXPIRED:
      return RsvpStatus.COMPLETE_EXPIRED;
    default:
      return assertNever(completeRsvpStatus);
  }
}

async function getRsvpStatus(hackerInstance: Hacker): Promise<RsvpStatus | null> {
  const hackerApplication = await hackerInstance.getHackerApplication();
  if (hackerApplication === null) { return null; }

  const applicationResponse = await hackerApplication.getApplicationResponse();
  if (applicationResponse === null || applicationResponse.response === ResponseStatus.REJECTED) {
    // User hasn't been invited, we don't need an RSVP
    return RsvpStatus.NOT_APPLICABLE;
  } else {
    return applicationResponse.getResponseRsvp().then(rsvp => {
      if (rsvp === null) {
        // User invited but hasn't rsvp'd
        return RsvpStatus.INCOMPLETE;
      }
      return convertToRsvpStatus(rsvp.rsvp);
    });
  }
}

async function getIndividualApplicationStatus(hackerInstance: Hacker): Promise<IndividualApplicationStatus> {
  const hackerApplication = await hackerInstance.getHackerApplication();
  if (hackerApplication === null) {
    return IndividualApplicationStatus.INCOMPLETE;
  } else {
    return hackerApplication.isWithdrawn ? IndividualApplicationStatus.WITHDRAWN : IndividualApplicationStatus.COMPLETE;
  }
}

async function getTicketStatus(hackerInstance: Hacker): Promise<TicketStatus | null> {
  const hackerApplication = await hackerInstance.getHackerApplication();
  if (hackerApplication == null) { return null; }
  return hackerApplication.getApplicationTicket().then(applicationTicket => {
    return applicationTicket == null ? TicketStatus.NO_TICKET : TicketStatus.HAS_TICKET;
  });
}

/** Returns a promise that resolves to the headline application status */
function deriveOverallStatus(hackerStatuses: IndividualHackerStatuses): OverallStatus {
  if (hackerStatuses.individualApplicationStatus === IndividualApplicationStatus.INCOMPLETE ||
     hackerStatuses.teamApplicationStatus === TeamApplicationStatus.INCOMPLETE) {
    return process.env.APPLICATIONS_OPEN_STATUS === ApplicationsOpenStatus.OPEN ?
      OverallStatus.INCOMPLETE :
      OverallStatus.INCOMPLETE_CLOSED;
  } else if (hackerStatuses.individualApplicationStatus === IndividualApplicationStatus.WITHDRAWN) {
    return OverallStatus.WITHDRAWN;
  } else if (hackerStatuses.responseStatus === ResponseStatus.PENDING) {
    return OverallStatus.IN_REVIEW;
  } else if (hackerStatuses.responseStatus === ResponseStatus.REJECTED) {
    return OverallStatus.REJECTED;
  } else if (hackerStatuses.ticketStatus === TicketStatus.HAS_TICKET) {
    return OverallStatus.HAS_TICKET;
  } else if (hackerStatuses.rsvpStatus === RsvpStatus.INCOMPLETE) {
    return OverallStatus.INVITED_AWAITING_RSVP;
  } else if (hackerStatuses.rsvpStatus === RsvpStatus.COMPLETE_NO) {
    return OverallStatus.INVITED_DECLINED;
  } else if (hackerStatuses.rsvpStatus === RsvpStatus.COMPLETE_EXPIRED) {
    return OverallStatus.INVITED_EXPIRED;
  } else if (hackerStatuses.rsvpStatus === RsvpStatus.COMPLETE_YES) {
    return OverallStatus.INVITED_ACCEPTED;
  } else {
    console.log(hackerStatuses);
    throw new Error('Couldn\'t derive an overall status');
  }
}

export class TooYoungError extends Error { }

export class Hacker extends Model {
  public id?: number;
  public mlhId: number;
  public firstName: string;
  public lastName: string;
  public gender: string;
  public dateOfBirth: Date;
  public email: string;
  public phoneNumber: string;
  public institution: string;
  public studyLevel: string;
  public course: string;
  public shirtSize: string;
  public dietaryRestrictions: string;
  public specialNeeds?: string;

  public getHackerApplication: HasOneGetAssociationMixin<HackerApplication>;
  public hackerApplication?: HackerApplication;
  public getTeamMember: HasOneGetAssociationMixin<TeamMember>;
  public teamMember?: TeamMember; // TODO: check should be uppercase

  public static async upsertAndFetchFromMlhUser(mlhUser): Promise<Hacker> {
    const under18Cutoff = dates.getHackathonStartDate().subtract(18, 'years');

    if (moment(mlhUser.date_of_birth).isAfter(under18Cutoff)) {
      return Promise.reject(new TooYoungError());
    }

    return Hacker.upsert({
      // Personal
      mlhId: mlhUser.id,
      firstName: mlhUser.first_name,
      lastName: mlhUser.last_name,
      gender: mlhUser.gender,
      dateOfBirth: mlhUser.date_of_birth,
      email: mlhUser.email,
      phoneNumber: mlhUser.phone_number,
      // Education
      institution: mlhUser.school.name,
      studyLevel: mlhUser.level_of_study,
      course: mlhUser.major,
      // Logistics
      shirtSize: mlhUser.shirt_size,
      dietaryRestrictions: mlhUser.dietary_restrictions,
      specialNeeds: mlhUser.special_needs,
    }).then(isNewUser => {
      if (isNewUser) {
        console.log('Created new user');
      }

      return Hacker.findOne({
        where: { mlhId: mlhUser.id }
      });
    });
  }

  public async getStatuses(): Promise<HackerStatuses> {
    const individualStatuses: IndividualHackerStatuses = {
      individualApplicationStatus: await getIndividualApplicationStatus(this),
      teamApplicationStatus: await getTeamApplicationStatus(this),
      responseStatus: await getResponseStatus(this),
      rsvpStatus: await getRsvpStatus(this),
      ticketStatus: await getTicketStatus(this),
    };
    return {
      ...individualStatuses,
      overallStatus: await deriveOverallStatus(individualStatuses)
    };
  }

  public log(logText: string): void {
    console.log(`[User ${this.id}] ${logText}`);
  }
}

Hacker.init({
  // Personal
  mlhId: {
    type: Sequelize.INTEGER,
    allowNull: false,
    unique: true
  },
  firstName: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  lastName: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  gender: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  dateOfBirth: {
    type: Sequelize.DATEONLY,
    allowNull: false,
  },
  email: {
    type: Sequelize.TEXT,
    allowNull: false,
    validate: {
      isEmail: true,
    },
  },
  phoneNumber: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  // Education
  institution: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  studyLevel: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  course: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  // Logistics
  shirtSize: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  dietaryRestrictions: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  specialNeeds: {
    type: Sequelize.TEXT,
  },
}, {
  sequelize: db,
  modelName: 'hacker',
  tableName: 'hackers',
});
