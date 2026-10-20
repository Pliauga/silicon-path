/**
 * A lesson frame (LazyStudy) provides this context so a 3D study knows it is
 * being read inside an article rather than standing alone as a Gallery route.
 * The studies also accept an explicit `embedded` prop; the context is what lets
 * `<CPUExplodedView />` adapt without the lesson passing anything.
 */
export const STUDY_FRAME = Symbol('silicon-path:study-frame');

export type StudyFrame = {
	embedded: boolean;
};