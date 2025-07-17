import { z } from "zod";

// Validation schemas
export const ProjectNameSchema = z
  .string()
  .min(1, "Project name is required")
  .max(50, "Project name must be 50 characters or less")
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    "Project name can only contain letters, numbers, hyphens, and underscores"
  )
  .refine(
    (name) => !name.startsWith("-") && !name.endsWith("-"),
    "Project name cannot start or end with a hyphen"
  );

export const DescriptionSchema = z
  .string()
  .min(1, "Description is required")
  .max(200, "Description must be 200 characters or less");

export const URLSchema = z
  .string()
  .url("Please enter a valid URL")
  .refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://"
  );

export const URLListSchema = z
  .array(URLSchema)
  .min(1, "At least one URL is required")
  .max(10, "Maximum 10 URLs allowed");

// Types
export type SearchProvider = "vectra" | "flexsearch";

export interface ProjectConfig {
  name: string;
  description: string; // Now required
  directory: string;
  urls: string[];
  contentSelector?: string;
  linkSelector?: string;
  excludePatterns?: string[];
  includePatterns?: string[];
}

// Validation functions
export function validateProjectName(name: string): {
  isValid: boolean;
  error?: string;
} {
  try {
    ProjectNameSchema.parse(name);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.errors[0].message };
    }
    return { isValid: false, error: "Invalid project name" };
  }
}

export function validateDescription(description: string): {
  isValid: boolean;
  error?: string;
} {
  try {
    DescriptionSchema.parse(description);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.errors[0].message };
    }
    return { isValid: false, error: "Invalid description" };
  }
}

export function validateURL(url: string): { isValid: boolean; error?: string } {
  try {
    URLSchema.parse(url);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.errors[0].message };
    }
    return { isValid: false, error: "Invalid URL" };
  }
}

export function validateURLList(urls: string[]): {
  isValid: boolean;
  error?: string;
} {
  try {
    URLListSchema.parse(urls);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.errors[0].message };
    }
    return { isValid: false, error: "Invalid URL list" };
  }
}
