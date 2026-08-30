declare module "h5p-standalone" {
  export interface H5POptions {
    h5pJsonPath: string;
    librariesPath?: string;
    contentJsonPath?: string;
    frameJs: string;
    frameCss: string;
    id?: string;
    frame?: boolean;
    copyright?: boolean;
    embed?: boolean;
    export?: boolean;
    icon?: boolean;
  }
  export class H5P {
    constructor(
      el: HTMLElement,
      options: H5POptions,
      displayOptions?: Record<string, unknown>,
    );
  }
  export const H5PStandalone: { H5P: typeof H5P };
}
