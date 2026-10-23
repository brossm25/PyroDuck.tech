import type { ImageMetadata } from "astro";

import hopeHouseOld from "@/assets/projects/old-website-hope-house.png";
import hopeHouseDesktop from "@/assets/projects/hope-house-desktop.png";
import hopeHouseMobile from "@/assets/projects/hope-house-mobile.png";
import hopeHouseServices from "@/assets/projects/hope-house-services.png";

import pyroDuckDesktop from "@/assets/projects/pyroduck-desktop.png";
import pyroDuckMobile from "@/assets/projects/pyroduck-mobile.png";
import pyroDuckPortfolio from "@/assets/projects/pyroduck-services.png";

import binderLinkSearch from "@/assets/projects/pyroduck-mtg-search-working.png";
import binderLinkPrinting from "@/assets/projects/pyroduck-mtg-printing-picker.png";
import binderLinkChase from "@/assets/projects/pyroduck-mtg-current-prices-total-desktop.png";
import binderLinkMatches from "@/assets/projects/pyroduck-chase-card-match-to-random-seller.png";
import binderLinkPriceDrop from "@/assets/projects/pyroduck-price-lower.png";
import binderLinkProfile from "@/assets/projects/pyroduck-view-person-profile.png";

export interface ProjectScreenshot {
  image: ImageMetadata;
  alt: string;
  label: string;
  description?: string;
}

export interface Project {
  name: string;
  status: string;
  description: string;
  url?: string;
  image?: ImageMetadata;
  imageAlt?: string;
  before?: ProjectScreenshot;
  gallery?: ProjectScreenshot[];
}

export const projects: Project[] = [
  {
    name: "Hope House Guthrie",
    status: "In development",
    description:
      "A community-focused website sharing Hope House Guthrie’s mission, programs, services, and ways to get involved.",
    image: hopeHouseDesktop,
    imageAlt:
      "Hope House Guthrie homepage featuring an aerial view of the building and the headline Hope Starts Here.",
    before: {
      image: hopeHouseOld,
      alt: "Hope House Guthrie website before the redesign.",
      label: "Original Website",
      description:
        "The original Hope House Guthrie website, shown here as a starting point for the redesign.",
    },
    gallery: [
      {
        image: hopeHouseMobile,
        alt: "Hope House Guthrie homepage at mobile screen width.",
        label: "Mobile",
        description:
          "The mobile layout keeps Hope House’s mission, services, and ways to get involved easy to explore on a phone.",
      },
      {
        image: hopeHouseServices,
        alt: "Hope House Guthrie walk-in services page with service cards.",
        label: "Services",
        description:
          "Service cards help visitors find available walk-in support and understand what Hope House offers.",
      },
    ],
  },
  {
    name: "PyroDuck Tech",
    status: "You’re here",
    description:
      "My personal portfolio and a place to develop projects like BinderLink, where Magic: The Gathering players can track chase cards, list cards for sale, and connect with other collectors.",
    image: pyroDuckDesktop,
    imageAlt:
      "PyroDuck Tech homepage with purple and lime branding and the headline Practical websites. Creative solutions.",
    gallery: [
      {
        image: pyroDuckMobile,
        alt: "PyroDuck Tech homepage at mobile screen width.",
        label: "Mobile",
        description:
          "The homepage adapts to smaller screens with readable text, clear navigation, and the same purple and lime branding.",
      },
      {
        image: pyroDuckPortfolio,
        alt: "PyroDuck Tech portfolio section displaying project cards.",
        label: "Portfolio",
        description:
          "Project cards introduce my work, with screenshot galleries showing the layouts and features behind each project.",
      },
      {
        image: binderLinkSearch,
        alt: "Magic: The Gathering card search results in BinderLink.",
        label: "Card Search",
        description:
          "Scryfall-powered search helps players find cards and explore the artwork they want to collect.",
      },
      {
        image: binderLinkPrinting,
        alt: "BinderLink printing picker for choosing a card version.",
        label: "Printing Picker",
        description:
          "Players can choose a specific printing and finish before saving a card to their chase list.",
      },
      {
        image: binderLinkChase,
        alt: "BinderLink chase list showing card prices and a combined total.",
        label: "Chase List",
        description:
          "Saved chase cards include pricing references from Scryfall and a combined total to help players plan their collection.",
      },
      {
        image: binderLinkMatches,
        alt: "A sale listing matching a card on a BinderLink chase list.",
        label: "Sale Matches",
        description:
          "BinderLink finds sale listings for cards on a player’s chase list, including other printings, artwork, and finishes. Players can contact the seller through a private conversation.",
      },
      {
        image: binderLinkPriceDrop,
        alt: "A BinderLink sale match marked with a price-drop notice.",
        label: "Price Drops",
        description:
          "Players can hide individual listings they are not interested in. A hidden match can return with a price-drop notice when the seller lowers the asking price.",
      },
      {
        image: binderLinkProfile,
        alt: "BinderLink player profile with sections for chase cards, shared decks, and cards for sale.",
        label: "Player Profiles",
        description:
          "Shareable player profiles bring chase cards, shared decks, and available sale listings together while respecting each list’s viewing permissions.",
      },
    ],
  },
];
