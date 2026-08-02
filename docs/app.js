


export default {
    
}

function toDisplayName(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function partImageSlug(joined) {
    return joined.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}