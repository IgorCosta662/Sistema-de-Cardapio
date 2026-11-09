import QRCode from 'qrcode';

const clientUrl = process.argv[2] || process.env.APP_URL || 'http://localhost:3000';
const staffUrl = process.argv[3] || 'http://localhost:3001';

async function renderTerminalQr() {
  try {
    const clientQrString = await QRCode.toString(clientUrl, {
      type: 'terminal',
      small: true,
    });

    console.log('');
    console.log('============================================================================');
    console.log('  [1] QR CODE DO CLIENTE (CARDAPIO DA MESA - SEM BOTAO DE EQUIPE)');
    console.log(`      Porta Exclusiva do Cliente: ${clientUrl}`);
    console.log('============================================================================');
    console.log(clientQrString);
    console.log('----------------------------------------------------------------------------');
    console.log(`  URL Exclusiva CLIENTES (Mesas)         : ${clientUrl}`);
    console.log(`  URL Exclusiva EQUIPE (Garcom/Cozinha)  : ${staffUrl}`);
    console.log('----------------------------------------------------------------------------');
    console.log('  Credenciais Demo Cliente (Porta 3000)  : Codigo MESA01 | Senha: 123456');
    console.log('  PINs da Equipe (Porta 3001)            : Garcom 1111 | Cozinha 2222 | Caixa 3333 | Admin 4444');
    console.log('============================================================================');
    console.log('');
  } catch (err) {
    console.error('Erro ao gerar QR Code no terminal:', err);
  }
}

renderTerminalQr();
