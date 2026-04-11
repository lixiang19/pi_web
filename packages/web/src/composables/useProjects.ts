import { ref } from "vue";

import {
  addProject as createProject,
  deleteProject as destroyProject,
  getProjects,
} from "@/lib/api";
import type { ProjectItem } from "@/lib/types";

const sortProjects = (projects: ProjectItem[]) =>
  [...projects].sort((left, right) => right.addedAt - left.addedAt);

const projects = ref<ProjectItem[]>([]);
const isLoading = ref(false);
const error = ref("");
let loadPromise: Promise<ProjectItem[]> | null = null;

const load = async (options?: { force?: boolean }) => {
  if (!options?.force && projects.value.length > 0) {
    return projects.value;
  }

  if (loadPromise) {
    return loadPromise;
  }

  isLoading.value = true;
  error.value = "";

  loadPromise = getProjects()
    .then((response) => {
      projects.value = sortProjects(response.projects);
      return projects.value;
    })
    .catch((caughtError) => {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    })
    .finally(() => {
      isLoading.value = false;
      loadPromise = null;
    });

  return loadPromise;
};

const add = async (path: string) => {
  isLoading.value = true;
  error.value = "";

  try {
    const project = await createProject(path);
    const nextProjects = projects.value.filter((item) => item.id !== project.id);
    projects.value = sortProjects([project, ...nextProjects]);
    return project;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    return null;
  } finally {
    isLoading.value = false;
  }
};

const remove = async (id: string) => {
  isLoading.value = true;
  error.value = "";

  try {
    await destroyProject(id);
    projects.value = projects.value.filter((item) => item.id !== id);
    return true;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    return false;
  } finally {
    isLoading.value = false;
  }
};

export function useProjects() {
  return {
    add,
    error,
    isLoading,
    load,
    projects,
    remove,
  };
}
