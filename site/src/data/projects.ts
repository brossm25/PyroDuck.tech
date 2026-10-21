import type { ImageMetadata } from "astro";

import hopeHouseOld from "@/assets/projects/old-website-hope-house.png";
import hopeHouseDesktop from "@/assets/projects/hope-house-desktop.png";
import hopeHouseMobile from "@/assets/projects/hope-house-mobile.png";
import hopeHouseServices from "@/assets/projects/hope-house-services.png";

import pyroDuckDesktop from "@/assets/projects/pyroduck-desktop.png";
import pyroDuckMobile from "@/assets/projects/pyroduck-mobile.png";
import pyroDuckPortfolio from "@/assets/projects/pyroduck-services.png";

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
      "My personal portfolio, built to share my projects, develop my skills, and connect with people who need a website.",
    image: pyroDuckDesktop,
    imageAlt:
      "PyroDuck Tech homepage with purple and lime branding and the headline Practical websites. Creative solutions.",
    gallery: [
      {
        image: pyroDuckMobile,
        alt: "PyroDuck Tech homepage at mobile screen width.",
        label: "Mobile",
      },
      {
        image: pyroDuckPortfolio,
        alt: "PyroDuck Tech portfolio section displaying project cards.",
        label: "Portfolio",
      },
    ],
  },
];
