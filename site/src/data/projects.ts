import type { ImageMetadata } from "astro";
import hopeHouseDesktop from "@/assets/projects/hope-house-desktop.png";
import pyroDuckDesktop from "@/assets/projects/pyroduck-desktop.png";

export interface Project {
  name: string;
  status: string;
  description: string;
  url?: string;
  image?: ImageMetadata;
  imageAlt?: string;
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
  },
  {
    name: "PyroDuck Tech",
    status: "You’re here",
    description:
      "My personal portfolio, built to share my projects, develop my skills, and connect with people who need a website.",
    image: pyroDuckDesktop,
    imageAlt:
      "PyroDuck Tech homepage with purple and lime branding and the headline Practical websites. Creative solutions.",
  },
];
