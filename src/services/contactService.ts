// import { PrismaClient, Contact, LinkPrecedence } from "@prisma/client";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Contact, LinkPrecedence } from "../generated/prisma";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

interface IdentifyRequest {
  email?: string | null;
  phoneNumber?: string | null;
}

interface IdentifyResponse {
  contact: {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

export async function identifyContact(
  request: IdentifyRequest
): Promise<IdentifyResponse> {
  const { email, phoneNumber } = request;

  // Validate at least one field is provided
  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided");
  }

  // ─── Step 1: Find all contacts matching email OR phoneNumber ───────────────
  const matchingContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
  });

  // ─── Step 2: No matches → create a brand new primary contact ──────────────
  if (matchingContacts.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkPrecedence: LinkPrecedence.primary,
      },
    });

    return buildResponse(newContact, []);
  }

  // ─── Step 3: Gather all primary contacts from the matched set ─────────────
  // Each matching contact could be primary itself or point to a primary.
  // Collect all unique primary IDs.
  const primaryIds = new Set<number>();

  for (const contact of matchingContacts) {
    if (contact.linkPrecedence === LinkPrecedence.primary) {
      primaryIds.add(contact.id);
    } else if (contact.linkedId !== null) {
      primaryIds.add(contact.linkedId);
    }
  }

  // Fetch all primary contacts (some may not have appeared in matchingContacts)
  const primaryContacts = await prisma.contact.findMany({
    where: {
      id: { in: Array.from(primaryIds) },
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  // The oldest primary is THE primary
  const truePrimary = primaryContacts[0];

  // ─── Step 4: Merge secondary primaries into the true primary ──────────────
  // If there are multiple primaries (two separate clusters now linked),
  // demote the newer ones to secondary
  const otherPrimaries = primaryContacts.slice(1);

  if (otherPrimaries.length > 0) {
    const otherPrimaryIds = otherPrimaries.map((c: Contact) => c.id);

    // Demote the other primaries
    await prisma.contact.updateMany({
      where: { id: { in: otherPrimaryIds } },
      data: {
        linkPrecedence: LinkPrecedence.secondary,
        linkedId: truePrimary.id,
        updatedAt: new Date(),
      },
    });

    // Re-link any secondaries that were pointing to the demoted primaries
    await prisma.contact.updateMany({
      where: {
        linkedId: { in: otherPrimaryIds },
        deletedAt: null,
      },
      data: {
        linkedId: truePrimary.id,
        updatedAt: new Date(),
      },
    });
  }

  // ─── Step 5: Fetch all contacts in the consolidated cluster ───────────────
  const allClusterContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: truePrimary.id }, { linkedId: truePrimary.id }],
    },
    orderBy: { createdAt: "asc" },
  });

  // ─── Step 6: Check if the incoming request has new information ────────────
  const allEmails = new Set(
    allClusterContacts.map((c: Contact) => c.email).filter(Boolean)
  );
  const allPhones = new Set(
    allClusterContacts.map((c: Contact) => c.phoneNumber).filter(Boolean)
  );

  const isNewEmail = email && !allEmails.has(email);
  const isNewPhone = phoneNumber && !allPhones.has(phoneNumber);

  // Create a secondary contact if there's genuinely new info
  if (isNewEmail || isNewPhone) {
    const newSecondary = await prisma.contact.create({
      data: {
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkedId: truePrimary.id,
        linkPrecedence: LinkPrecedence.secondary,
      },
    });
    allClusterContacts.push(newSecondary);
  }

  // ─── Step 7: Build and return the response ────────────────────────────────
  const secondaryContacts = allClusterContacts.filter(
    (c: Contact) => c.id !== truePrimary.id
  );

  return buildResponse(truePrimary, secondaryContacts);
}

function buildResponse(
  primary: Contact,
  secondaries: Contact[]
): IdentifyResponse {
  // Collect unique emails: primary's email first, then secondary emails
  const emailSet = new Set<string>();
  const emails: string[] = [];

  if (primary.email) {
    emailSet.add(primary.email);
    emails.push(primary.email);
  }

  for (const c of secondaries) {
    if (c.email && !emailSet.has(c.email)) {
      emailSet.add(c.email);
      emails.push(c.email);
    }
  }

  // Collect unique phone numbers: primary's phone first, then secondary phones
  const phoneSet = new Set<string>();
  const phoneNumbers: string[] = [];

  if (primary.phoneNumber) {
    phoneSet.add(primary.phoneNumber);
    phoneNumbers.push(primary.phoneNumber);
  }

  for (const c of secondaries) {
    if (c.phoneNumber && !phoneSet.has(c.phoneNumber)) {
      phoneSet.add(c.phoneNumber);
      phoneNumbers.push(c.phoneNumber);
    }
  }

  return {
    contact: {
      primaryContatctId: primary.id,
      emails,
      phoneNumbers,
      secondaryContactIds: secondaries.map((c) => c.id),
    },
  };
}
