const SUPABASE_URL = 'https://hqvkoxrdheofcqtbpczm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gnhhiPYxrZ0xE1gpaVJEeQ_80Ik67J6';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const SENHA_ADM = "1234";

const TABELAS_POR_MINISTERIO = {
    integracao: { nome: 'Integração', cultos: 'cultos_integracao', escalas: 'escalas_integracao' },
    estacionamento: { nome: 'Estacionamento', cultos: 'cultos_estacionamento', escalas: 'escalas_estacionamento' }
};

let servoAtual = { nome: '', tel: '', ministerio: '' };

function tabelasAtuais(chaveMinisterio = servoAtual.ministerio) {
    return TABELAS_POR_MINISTERIO[chaveMinisterio];
}

function mostrarTela(id) {
    ['step-1', 'step-ministerio', 'step-2', 'step-3', 'step-login-adm', 'step-dashboard'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

// --- LÓGICA DO SERVO ---
async function entrarNaEscala() {
    const nome = document.getElementById('nome-servo').value.trim();
    const tel = document.getElementById('tel-servo').value.trim();
    if(!nome || !tel) return alert("Preencha seu nome e WhatsApp.");

    servoAtual = { nome, tel, ministerio: '' };
    mostrarTela('step-ministerio');
}

async function confirmarMinisterio() {
    const ministerio = document.getElementById('ministerio-servo').value;
    if(!ministerio) return alert("Escolha um ministério para continuar.");
    
    servoAtual.ministerio = ministerio;
    document.getElementById('txt-boas-vindas').innerText = `Olá, ${servoAtual.nome.split(' ')[0]}!`;
    mostrarTela('step-2');
    await carregarCultos();
}

async function carregarCultos() {
    const container = document.getElementById('lista-cultos');
    container.innerHTML = '<p>Carregando cultos...</p>';
    const tabelas = tabelasAtuais();
    
    const { data: cultos, error: erroCultos } = await _supabase.from(tabelas.cultos).select('*').order('dia_hora', { ascending: true });
    const { data: escalas, error: erroEscalas } = await _supabase.from(tabelas.escalas).select('*');
    
    container.innerHTML = '';
    if (erroCultos || erroEscalas) {
        container.innerHTML = `<p>As tabelas do ministério ${tabelas.nome} ainda não estão disponíveis.</p>`;
        return;
    }
    
    if(cultos.length === 0) {
        container.innerHTML = '<p>Nenhum culto disponível para esta semana.</p>';
        return;
    }

    cultos.forEach(c => {
        // Filtra inscrições totais deste culto
        const todasDoCulto = escalas.filter(e => e.culto_id === c.id);
        const ocupadas = todasDoCulto.length;
        const restam = c.vagas_totais - ocupadas;
        const lotado = restam <= 0;

        // MUDANÇA AQUI: Verifica se ESTE servo específico (pelo número do tel) já está cadastrado neste culto
        const jaInscrito = todasDoCulto.some(e => e.whatsapp_servo === servoAtual.tel);

        const div = document.createElement('div');
        div.className = 'culto-card';
        
        // Define o estado do checkbox e dos badges com base no histórico
        let checkboxAtributos = `value="${c.id}" name="cultos_selecionados"`;
        let badgeHtml = '';

        if (jaInscrito) {
            checkboxAtributos += ' checked disabled'; // Já vem marcado e travado
            badgeHtml = `<div class="badge badge-ja-inscrito"><i class="fa-solid fa-user-check"></i> VOCÊ JÁ VAI</div>
                <button class="btn-cancelar-inscricao" onclick="event.stopPropagation(); cancelarInscricao(${c.id})">
                    <i class="fa-solid fa-xmark"></i> DESMARCAR
                </button>`;
        } else if (lotado) {
            checkboxAtributos += ' disabled'; // Travado por falta de vaga
            badgeHtml = `<div class="badge badge-full">LOTADO</div>`;
        } else {
            badgeHtml = `<div class="badge badge-open">${restam} VAGAS</div>`;
        }

        div.innerHTML = `
            <div class="culto-checkbox-area">
                <input type="checkbox" ${checkboxAtributos}>
            </div>
            <div class="culto-info" onclick="const cb = this.parentElement.querySelector('input[type=checkbox]'); if(!cb.disabled) cb.checked = !cb.checked;">
                <strong>${new Date(c.dia_hora).toLocaleString('pt-BR')}</strong>
                <span>${c.descricao}</span>
                <br>${badgeHtml}
            </div>
        `;
        container.appendChild(div);
    });
}

async function salvarVariasEscalas() {
    const checkboxes = document.querySelectorAll('input[name="cultos_selecionados"]:checked');
    
    // Filtra apenas os IDs que não estavam travados (ou seja, novas marcações)
    const novosIds = Array.from(checkboxes)
        .filter(cb => !cb.disabled)
        .map(cb => parseInt(cb.value));

    if(novosIds.length === 0) {
        return alert("Selecione pelo menos um novo culto para se inscrever!");
    }

    document.getElementById('btn-confirmar-escala').disabled = true;
    document.getElementById('btn-confirmar-escala').innerText = "Salvando...";

    // Prepara o array de inserts para o Supabase
    const registros = novosIds.map(id => ({
        culto_id: id,
        nome_servo: servoAtual.nome,
        whatsapp_servo: servoAtual.tel
    }));

    const { error } = await _supabase.from(tabelasAtuais().escalas).insert(registros);

    if(!error) {
        mostrarTela('step-3');
    } else {
        alert("Ocorreu um erro ao salvar as escalas. Tente novamente.");
        document.getElementById('btn-confirmar-escala').disabled = false;
        document.getElementById('btn-confirmar-escala').innerText = "CONFIRMAR INSCRIÇÕES";
    }
}

async function cancelarInscricao(cultoId) {
    if(!confirm("Deseja desmarcar sua participação neste culto?")) return;

    const { error } = await _supabase
        .from(tabelasAtuais().escalas)
        .delete()
        .eq('culto_id', cultoId)
        .eq('whatsapp_servo', servoAtual.tel);

    if(error) {
        alert("Não foi possível desmarcar o horário. Tente novamente.");
        return;
    }

    await carregarCultos();
}

// --- LÓGICA ADMIN ---
function logarAdmin() {
    if(document.getElementById('senha-adm').value === SENHA_ADM) {
        mostrarTela('step-dashboard');
        admCarregarListaCultos();
    } else alert("Senha incorreta!");
}

async function admCarregarListaCultos() {
    const list = document.getElementById('adm-lista-cultos');
    list.innerHTML = 'Carregando...';
    const tabelas = tabelasAtuais(document.getElementById('ministerio-admin').value);
    const { data: cultos, error: erroCultos } = await _supabase.from(tabelas.cultos).select('*').order('dia_hora', { ascending: true });
    const { data: escalas, error: erroEscalas } = await _supabase.from(tabelas.escalas).select('culto_id');
    list.innerHTML = '';
    if (erroCultos || erroEscalas) {
        list.innerHTML = `<p>As tabelas do ministério ${tabelas.nome} ainda não estão disponíveis.</p>`;
        return;
    }
    cultos.forEach(c => {
        const item = document.createElement('div');
        item.className = 'adm-list-item';
        const inscritos = escalas.filter(e => e.culto_id === c.id).length;
        const vagasRestantes = Math.max(0, c.vagas_totais - inscritos);
        item.innerHTML = `
            <div>
                <strong>${c.descricao}</strong><br>
                <small>${new Date(c.dia_hora).toLocaleString('pt-BR')} | Vagas: ${c.vagas_totais} | Restam: ${vagasRestantes}</small>
            </div>
            <div class="adm-actions">
                <button class="btn-edit" onclick='prepararEdicao(${JSON.stringify(c)})'><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-delete" onclick="admExcluirCulto(${c.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function admSalvarCulto() {
    const id = document.getElementById('edit-id').value;
    const desc = document.getElementById('adm-desc').value;
    const data = document.getElementById('adm-data').value;
    const vagas = document.getElementById('adm-vagas').value;

    if(!desc || !data) return alert("Preencha os campos!");

    const dados = { descricao: desc, dia_hora: data, vagas_totais: vagas };
    const tabelas = tabelasAtuais(document.getElementById('ministerio-admin').value);
    let res;

    if(id) {
        res = await _supabase.from(tabelas.cultos).update(dados).eq('id', id);
    } else {
        res = await _supabase.from(tabelas.cultos).insert([dados]);
    }

    if(!res.error) {
        alert(id ? "Culto atualizado!" : "Culto criado!");
        limparFormAdmin();
        admCarregarListaCultos();
    } else alert("Erro ao salvar.");
}

function prepararEdicao(culto) {
    document.getElementById('edit-id').value = culto.id;
    document.getElementById('adm-desc').value = culto.descricao;
    document.getElementById('adm-data').value = culto.dia_hora;
    document.getElementById('adm-vagas').value = culto.vagas_totais;
    
    document.getElementById('lbl-form-culto').innerText = "EDITANDO CULTO";
    document.getElementById('btn-salvar-culto').innerText = "SALVAR ALTERAÇÕES";
    document.getElementById('btn-cancelar-edit').classList.remove('hidden');
}

function limparFormAdmin() {
    document.getElementById('edit-id').value = "";
    document.getElementById('adm-desc').value = "";
    document.getElementById('adm-data').value = "";
    document.getElementById('adm-vagas').value = "10";
    
    document.getElementById('lbl-form-culto').innerText = "ADICIONAR NOVO CULTO";
    document.getElementById('btn-salvar-culto').innerText = "CADASTRAR CULTO";
    document.getElementById('btn-cancelar-edit').classList.add('hidden');
}

async function admExcluirCulto(id) {
    if(!confirm("Deseja realmente excluir este culto? Todas as escalas vinculadas serão perdidas.")) return;
    const tabelas = tabelasAtuais(document.getElementById('ministerio-admin').value);
    const { error } = await _supabase.from(tabelas.cultos).delete().eq('id', id);
    if(!error) admCarregarListaCultos();
    else alert("Erro ao excluir.");
}

async function admLimparEscalas() {
    if(confirm("Reiniciar ciclo? Isso apagará o nome de todos os servos inscritos em todos os cultos.")) {
        const tabelas = tabelasAtuais(document.getElementById('ministerio-admin').value);
        const { error } = await _supabase.from(tabelas.escalas).delete().neq('id', 0);
        if(!error) alert("Inscrições zeradas!");
    }
}

async function admGerarRelatorio() {
    const tabelas = tabelasAtuais(document.getElementById('ministerio-admin').value);
    const { data: cultos } = await _supabase.from(tabelas.cultos).select('*').order('dia_hora', { ascending: true });
    const { data: escalas } = await _supabase.from(tabelas.escalas).select('*');
    if (!cultos || cultos.length === 0) return alert("Não há dados.");
    let csvContent = "\uFEFFData;Horário;Culto;Servo;WhatsApp\n";
    cultos.forEach(c => {
        const d = new Date(c.gray || c.dia_hora);
        const dataStr = d.toLocaleDateString('pt-BR');
        const horaStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const inscritos = escalas.filter(e => e.culto_id === c.id);
        if (inscritos.length > 0) {
            inscritos.forEach(i => { csvContent += `${dataStr};${horaStr};${c.descricao};${i.nome_servo};${i.whatsapp_servo}\n`; });
        } else { csvContent += `${dataStr};${horaStr};${c.descricao};-- VAGO --;--\n`; }
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `escala_maanaim_${new Date().toLocaleDateString('pt-BR')}.csv`;
    link.click();
}

async function admGerarTextoZap() {
    const tabelas = tabelasAtuais(document.getElementById('ministerio-admin').value);
    const { data: cultos } = await _supabase.from(tabelas.cultos).select('*').order('dia_hora', { ascending: true });
    const { data: escalas } = await _supabase.from(tabelas.escalas).select('*');
    let texto = `📋 *ESCALA DE SERVOS - ${tabelas.nome.toUpperCase()}*\n\n`;
    cultos.forEach(c => {
        const d = new Date(c.dia_hora);
        const dataFormatada = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const horaFormatada = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const inscritos = escalas.filter(e => e.culto_id === c.id).map(i => i.nome_servo);
        const listaServos = inscritos.length > 0 ? inscritos.join(", ") : "_Vagas Disponíveis_";
        texto += `*${dataFormatada} - ${horaFormatada}h*\n⛪ ${c.descricao}\n👤 Servos: ${listaServos}\n\n`;
    });
    texto += "_Favor confirmar a escala no grupo!_";
    const tempInput = document.getElementById('temp-copy');
    tempInput.value = texto; tempInput.classList.remove('hidden'); tempInput.select();
    document.execCommand('copy'); tempInput.classList.add('hidden');
    alert("Texto copiado para a área de transferência!");
}
