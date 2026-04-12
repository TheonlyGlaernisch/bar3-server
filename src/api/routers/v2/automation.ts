
function getActiveUnalliedCandidatesGraphql(min_last_active = 86400, min_cities = null, max_cities = null) {
    const query = `
        query ($min_last_active: Int, $min_cities: Int, $max_cities: Int) {
            activeUnalliedCandidates(min_last_active: $min_last_active, min_cities: $min_cities, max_cities: $max_cities) {
                id
                last_active
                cities
                discord_id
            }
        }
    `;

    const variables = { min_last_active };

    // Conditionally include min_cities and max_cities
    if (min_cities !== null) {
        variables.min_cities = min_cities;
    }
    if (max_cities !== null) {
        variables.max_cities = max_cities;
    }

    return fetch('https://api.politicsandwar.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    }).then(res => res.json()).then(data => {
        return data.data.activeUnalliedCandidates.filter(candidate => candidate.discord_id); // Keep only Discord filtering client-side
    });
}
