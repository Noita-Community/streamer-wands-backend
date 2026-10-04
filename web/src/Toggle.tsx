// The slider switch used for every on/off choice on the page.

type Props = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    title: string;
    /** Extra class on the wrapper; the stylesheet uses these to place individual switches. */
    class?: string;
};

export function Toggle({ checked, onChange, title, class: extra }: Props) {
    return (
        <div class={extra ? `switch-group ${extra}` : 'switch-group'}>
            <label class="switch">
                <input
                    type="checkbox"
                    checked={checked}
                    tabIndex={1}
                    onInput={(event) => onChange(event.currentTarget.checked)}
                />
                <span class="slider round"></span>
            </label>
            <span>{title}</span>
        </div>
    );
}
