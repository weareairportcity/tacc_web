/**
 * The church's details for the privacy policy and terms (commune…/privacy, /terms, /cookies).
 * TO FILL IN before these pages are relied on: the registered name and address, the contact
 * for data questions, and the Data Protection Commission registration number (Act 843).
 * Empty values show as "the church office" or are left out.
 */
export const LEGAL = {
  church: "The Airport City Church",
  address: "",
  email: "",
  phone: "",
  dpcNumber: "",
  updated: "3 November 2026",
};

export const legalContact = () =>
  [LEGAL.email, LEGAL.phone].filter(Boolean).join(" or ") || "the church office, or the Call / WhatsApp number on your camp's page";
