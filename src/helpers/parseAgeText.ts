export type TimeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

export function parseAgeText(ageString: string): { amount: number, unit: TimeUnit } | undefined {
    let ageStringParts = ageString.split(" ");
    if (ageStringParts.length !== 3) return undefined;
    let numPart: number | undefined = parseInt(ageStringParts[0]);
    if (isNaN(numPart)) return undefined;

    let unitPart: string = ageStringParts[1];
    let unit: TimeUnit | undefined = undefined;
    switch (unitPart.toLowerCase()) {
        case "second":
        case "seconds":
            unit = "second";
            break;
        case "minute":
        case "minutes":
            unit = "minute";
            break;
        case "hour":
        case "hours":
            unit = "hour";
            break;
        case "day":
        case "days":
            unit = "day";
            break;
        case "week":
        case "weeks":
            unit = "week";
            break;
        case "month":
        case "months":
            unit = "month";
            break;
        case "year":
        case "years":
            unit = "year";
            break;
        default:
            return undefined;
    }

    return {amount: numPart, unit};
}
