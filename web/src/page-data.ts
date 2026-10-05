// The data the server wrote into this page as it served it. See server/pages.ts for how it gets
// there and server/page-data.ts for what each page is given.

export function readPageData<T>(): T {
    return JSON.parse(document.getElementById('page-data')!.textContent) as T;
}
